import {
  computeProcurement,
  type CalcInput,
  type CalcRefs,
  type CalcResult,
  type FabricDto,
  type FabricInput,
  type FabricUpdate,
  type FactDto,
  type OrderDto,
  type OrderMode,
  type OrderSummaryDto,
  type PassportDto,
  type PassportInput,
  type SkuDto,
  type SkuInput,
  type SkuUpdate,
  type SupplierDto,
  type SupplierFabricDto,
  type SupplierFabricInput,
  type SupplierFabricUpdate,
  type SupplierInput,
  type SupplierUpdate,
} from '@web-app-demo/contracts'

import type { Prisma } from '../generated/prisma/client'
import type { DbClient } from '../db'
import { AppError } from '../http/errors'

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

export class ProcurementService {
  constructor(private readonly db: DbClient) {}

  async listFabrics(): Promise<FabricDto[]> {
    const rows = await this.db.fabric.findMany({ where: { status: 'active' }, orderBy: { code: 'asc' } })
    return rows.map(toFabricDto)
  }

  async listSuppliers(): Promise<SupplierDto[]> {
    const rows = await this.db.supplier.findMany({ where: { status: 'active' }, orderBy: { code: 'asc' } })
    return rows.map(toSupplierDto)
  }

  async listSupplierFabrics(): Promise<SupplierFabricDto[]> {
    const rows = await this.db.supplierFabric.findMany({ where: { status: 'active' } })
    return rows.map(toSupplierFabricDto)
  }

  async listSkus(): Promise<SkuDto[]> {
    const rows = await this.db.sku.findMany({
      where: { status: 'active' },
      orderBy: { code: 'asc' },
      include: { passport: { include: { components: { include: { allowedFabrics: true } } } } },
    })
    return rows.map(toSkuDto)
  }

  // Build the immutable engine input snapshot from current reference data.
  private async buildSnapshot(input: CalcInput): Promise<{ input: CalcInput; refs: CalcRefs }> {
    const passportRow = await this.db.productPassport.findUnique({
      where: { skuId: input.skuId },
      include: { components: { include: { allowedFabrics: true } } },
    })
    if (!passportRow) {
      throw new AppError(404, 'NOT_FOUND', `No passport for sku ${input.skuId}`)
    }

    const componentById = new Map(passportRow.components.map((c) => [c.id, c]))
    const fabricIds = new Set<string>()
    for (const sel of input.componentSelections) {
      const component = componentById.get(sel.componentId)
      if (!component) {
        throw new AppError(400, 'VALIDATION_ERROR', `Component ${sel.componentId} is not in this passport`)
      }
      const allowed = component.allowedFabrics.map((a) => a.fabricId)
      if (allowed.length > 0 && !allowed.includes(sel.fabricId)) {
        throw new AppError(400, 'VALIDATION_ERROR', `Fabric ${sel.fabricId} is not allowed for component ${sel.componentId}`)
      }
      fabricIds.add(sel.fabricId)
    }

    const fabricRows = await this.db.fabric.findMany({ where: { id: { in: [...fabricIds] }, status: 'active' } })
    if (fabricRows.length !== fabricIds.size) {
      throw new AppError(400, 'VALIDATION_ERROR', 'One or more selected fabrics were not found or are inactive')
    }

    const supplierFabricRows = await this.db.supplierFabric.findMany({
      where: {
        status: 'active',
        OR: input.componentSelections.map((s) => ({ supplierId: s.supplierId, fabricId: s.fabricId })),
      },
    })
    const sfByKey = new Set(supplierFabricRows.map((sf) => `${sf.supplierId}:${sf.fabricId}`))
    for (const sel of input.componentSelections) {
      if (!sfByKey.has(`${sel.supplierId}:${sel.fabricId}`)) {
        throw new AppError(400, 'VALIDATION_ERROR', `Supplier ${sel.supplierId} does not offer fabric ${sel.fabricId}`)
      }
    }

    const refs: CalcRefs = {
      passport: {
        skuId: passportRow.skuId,
        baseSize: passportRow.baseSize,
        version: passportRow.version,
        sizeCoefficients: passportRow.sizeCoefficients as Record<string, number>,
        components: passportRow.components.map((c) => ({
          componentId: c.id,
          role: c.role,
          name: c.name,
          normBase: c.normBase,
          lossCut: c.lossCut,
          lossSew: c.lossSew,
          allowedFabricIds: c.allowedFabrics.map((a) => a.fabricId),
        })),
      },
      fabrics: fabricRows.map((f) => ({
        id: f.id,
        name: f.name,
        category: f.category,
        canonicalUnit: f.canonicalUnit,
        densityGsm: f.densityGsm,
        widthCm: f.widthCm,
        preShrink: f.preShrink,
        rollSize: f.rollSize,
        rollUnit: f.rollUnit,
      })),
      supplierFabrics: supplierFabricRows.map((sf) => ({
        supplierId: sf.supplierId,
        fabricId: sf.fabricId,
        priceRub: sf.priceRub,
        priceUsd: sf.priceUsd,
        priceUnit: sf.priceUnit,
        rollSize: sf.rollSize,
      })),
    }

    return { input, refs }
  }

  async calc(input: CalcInput): Promise<CalcResult> {
    const { input: snapshotInput, refs } = await this.buildSnapshot(input)
    return computeProcurement(snapshotInput, refs)
  }

  async createOrder(input: CalcInput, mode: OrderMode, userId?: string): Promise<OrderDto> {
    const snapshot = await this.buildSnapshot(input)
    const result = computeProcurement(snapshot.input, snapshot.refs)

    const componentFabricMap = Object.fromEntries(
      input.componentSelections.map((s) => [s.componentId, { fabricId: s.fabricId, supplierId: s.supplierId }]),
    )

    const order = await this.db.order.create({
      data: {
        mode,
        skuId: input.skuId,
        sizeBreakdown: asJson(input.sizeBreakdown),
        componentFabricMap: asJson(componentFabricMap),
        fxRate: input.fxRate,
        reservePct: input.reservePct,
        defectPct: input.defectPct ?? 0,
        priceCurrency: input.currency,
        inputSnapshot: asJson(snapshot),
        result: asJson(result),
        createdById: userId,
      },
      include: { facts: true },
    })

    return toOrderDto(order)
  }

  async listOrders(): Promise<OrderSummaryDto[]> {
    const rows = await this.db.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: { sku: { select: { name: true } } },
    })
    return rows.map((o) => {
      const result = o.result as unknown as CalcResult
      return {
        id: o.id,
        mode: o.mode,
        skuId: o.skuId,
        skuName: o.sku?.name ?? null,
        totalGarments: result.totalGarments,
        currency: o.priceCurrency,
        totalCostRub: result.totalCostRub,
        createdAt: o.createdAt.toISOString(),
      }
    })
  }

  async getOrder(id: string): Promise<OrderDto> {
    const order = await this.db.order.findUnique({ where: { id }, include: { facts: true } })
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found')
    return toOrderDto(order)
  }

  // Facts are append-only; the saved order result is never recomputed (immutability invariant).
  async addFacts(
    orderId: string,
    facts: Array<{
      fabricId: string
      actualConsumed: number
      wasteFabric: number
      wasteSewing: number
      wasteNatural: number
      producedQty: number
    }>,
    userId?: string,
  ): Promise<OrderDto> {
    const order = await this.db.order.findUnique({ where: { id: orderId } })
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found')

    await this.db.actualFact.createMany({
      data: facts.map((f) => ({
        orderId,
        fabricId: f.fabricId,
        actualConsumed: f.actualConsumed,
        wasteFabric: f.wasteFabric,
        wasteSewing: f.wasteSewing,
        wasteNatural: f.wasteNatural,
        producedQty: f.producedQty,
        enteredById: userId,
      })),
    })

    return this.getOrder(orderId)
  }

  // --- Reference writes (admin) ---

  async createFabric(data: FabricInput): Promise<FabricDto> {
    const row = await this.db.fabric
      .create({
        data: {
          code: data.code, name: data.name, category: data.category, composition: data.composition ?? null,
          canonicalUnit: data.canonicalUnit, densityGsm: data.densityGsm, widthCm: data.widthCm,
          isDefaultWidth: data.isDefaultWidth, preShrink: data.preShrink, isDefaultShrink: data.isDefaultShrink,
          rollSize: data.rollSize, rollUnit: data.rollUnit,
        },
      })
      .catch(rethrowUnique('Ткань с таким кодом'))
    return toFabricDto(row)
  }

  async updateFabric(id: string, data: FabricUpdate): Promise<FabricDto> {
    await this.requireExists('fabric', id)
    const row = await this.db.fabric
      .update({
        where: { id },
        data: {
          code: data.code, name: data.name, category: data.category, composition: data.composition,
          canonicalUnit: data.canonicalUnit, densityGsm: data.densityGsm, widthCm: data.widthCm,
          isDefaultWidth: data.isDefaultWidth, preShrink: data.preShrink, isDefaultShrink: data.isDefaultShrink,
          rollSize: data.rollSize, rollUnit: data.rollUnit,
        },
      })
      .catch(rethrowUnique('Ткань с таким кодом'))
    return toFabricDto(row)
  }

  async deleteFabric(id: string): Promise<void> {
    await this.requireExists('fabric', id)
    await this.db.fabric.update({ where: { id }, data: { status: 'inactive' } })
  }

  async createSupplier(data: SupplierInput): Promise<SupplierDto> {
    const row = await this.db.supplier
      .create({ data: { code: data.code, name: data.name, country: data.country ?? null, leadTimeDays: data.leadTimeDays ?? null } })
      .catch(rethrowUnique('Поставщик с таким кодом'))
    return toSupplierDto(row)
  }

  async updateSupplier(id: string, data: SupplierUpdate): Promise<SupplierDto> {
    await this.requireExists('supplier', id)
    const row = await this.db.supplier
      .update({ where: { id }, data: { code: data.code, name: data.name, country: data.country, leadTimeDays: data.leadTimeDays } })
      .catch(rethrowUnique('Поставщик с таким кодом'))
    return toSupplierDto(row)
  }

  async deleteSupplier(id: string): Promise<void> {
    await this.requireExists('supplier', id)
    await this.db.supplier.update({ where: { id }, data: { status: 'inactive' } })
  }

  // Upsert by the (supplier, fabric) edge so the UI can add or re-price in one call.
  async upsertSupplierFabric(data: SupplierFabricInput): Promise<SupplierFabricDto> {
    const row = await this.db.supplierFabric.upsert({
      where: { supplierId_fabricId: { supplierId: data.supplierId, fabricId: data.fabricId } },
      create: {
        supplierId: data.supplierId, fabricId: data.fabricId, priceRub: data.priceRub ?? null,
        priceUsd: data.priceUsd ?? null, priceUnit: data.priceUnit, rollSize: data.rollSize ?? null, status: 'active',
      },
      update: {
        priceRub: data.priceRub ?? null, priceUsd: data.priceUsd ?? null, priceUnit: data.priceUnit,
        rollSize: data.rollSize ?? null, status: 'active',
      },
    })
    return toSupplierFabricDto(row)
  }

  async updateSupplierFabric(id: string, data: SupplierFabricUpdate): Promise<SupplierFabricDto> {
    await this.requireExists('supplierFabric', id)
    const row = await this.db.supplierFabric.update({
      where: { id },
      data: { priceRub: data.priceRub, priceUsd: data.priceUsd, priceUnit: data.priceUnit, rollSize: data.rollSize },
    })
    return toSupplierFabricDto(row)
  }

  async deleteSupplierFabric(id: string): Promise<void> {
    await this.requireExists('supplierFabric', id)
    await this.db.supplierFabric.update({ where: { id }, data: { status: 'inactive' } })
  }

  async createSku(data: SkuInput): Promise<SkuDto> {
    const row = await this.db.sku
      .create({ data: { code: data.code, name: data.name, category: data.category, fit: data.fit ?? null } })
      .catch(rethrowUnique('SKU с таким кодом'))
    return this.getSku(row.id)
  }

  async updateSku(id: string, data: SkuUpdate): Promise<SkuDto> {
    await this.requireExists('sku', id)
    await this.db.sku
      .update({ where: { id }, data: { code: data.code, name: data.name, category: data.category, fit: data.fit } })
      .catch(rethrowUnique('SKU с таким кодом'))
    return this.getSku(id)
  }

  async deleteSku(id: string): Promise<void> {
    await this.requireExists('sku', id)
    await this.db.sku.update({ where: { id }, data: { status: 'inactive' } })
  }

  async getSku(id: string): Promise<SkuDto> {
    const row = await this.db.sku.findUnique({
      where: { id },
      include: { passport: { include: { components: { include: { allowedFabrics: true } } } } },
    })
    if (!row) throw new AppError(404, 'NOT_FOUND', 'SKU not found')
    return toSkuDto(row)
  }

  // Replace the SKU's passport (size coefficients + components + allowed fabrics).
  // Atomic: the upsert + wipe + component rebuild run in one transaction, so a
  // mid-rebuild failure (e.g. a bad allowed-fabric FK) rolls back instead of
  // leaving the passport with a truncated component set.
  async upsertPassport(skuId: string, data: PassportInput): Promise<SkuDto> {
    await this.requireExists('sku', skuId)
    await this.db.$transaction(async (tx) => {
      const passport = await tx.productPassport.upsert({
        where: { skuId },
        create: { skuId, baseSize: data.baseSize, sizeCoefficients: asJson(data.sizeCoefficients), version: 1 },
        update: { baseSize: data.baseSize, sizeCoefficients: asJson(data.sizeCoefficients), version: { increment: 1 } },
      })
      await tx.passportComponent.deleteMany({ where: { passportId: passport.id } })
      for (const c of data.components) {
        const component = await tx.passportComponent.create({
          data: {
            passportId: passport.id, role: c.role, name: c.name ?? null, normBase: c.normBase,
            normBaseMeters: c.normBaseMeters ?? null, lossCut: c.lossCut, lossSew: c.lossSew,
          },
        })
        await tx.componentAllowedFabric.createMany({
          data: c.allowedFabricIds.map((fabricId) => ({ componentId: component.id, fabricId })),
        })
      }
    })
    return this.getSku(skuId)
  }

  private async requireExists(model: 'fabric' | 'supplier' | 'supplierFabric' | 'sku', id: string): Promise<void> {
    const found =
      model === 'fabric' ? await this.db.fabric.findUnique({ where: { id } })
      : model === 'supplier' ? await this.db.supplier.findUnique({ where: { id } })
      : model === 'supplierFabric' ? await this.db.supplierFabric.findUnique({ where: { id } })
      : await this.db.sku.findUnique({ where: { id } })
    if (!found) throw new AppError(404, 'NOT_FOUND', `${model} ${id} not found`)
  }
}

function rethrowUnique(label: string) {
  return (error: unknown): never => {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002') {
      throw new AppError(409, 'CONFLICT', `${label} уже существует`)
    }
    throw error
  }
}

// --- mappers ---

type FabricRow = {
  id: string; code: string; name: string; category: string; composition: string | null
  canonicalUnit: 'kg' | 'm'; densityGsm: number; widthCm: number; isDefaultWidth: boolean
  preShrink: number; isDefaultShrink: boolean; rollSize: number; rollUnit: 'kg' | 'm'; status: string
}

function toFabricDto(f: FabricRow): FabricDto {
  return {
    id: f.id, code: f.code, name: f.name, category: f.category, composition: f.composition,
    canonicalUnit: f.canonicalUnit, densityGsm: f.densityGsm, widthCm: f.widthCm,
    isDefaultWidth: f.isDefaultWidth, preShrink: f.preShrink, isDefaultShrink: f.isDefaultShrink,
    rollSize: f.rollSize, rollUnit: f.rollUnit, status: f.status,
  }
}

function toSupplierDto(s: {
  id: string; code: string; name: string; country: string | null; leadTimeDays: number | null; status: string
}): SupplierDto {
  return { id: s.id, code: s.code, name: s.name, country: s.country, leadTimeDays: s.leadTimeDays, status: s.status }
}

function toSupplierFabricDto(sf: {
  id: string; supplierId: string; fabricId: string; priceRub: number | null; priceUsd: number | null
  priceUnit: 'kg' | 'm'; rollSize: number | null; status: string
}): SupplierFabricDto {
  return {
    id: sf.id, supplierId: sf.supplierId, fabricId: sf.fabricId, priceRub: sf.priceRub,
    priceUsd: sf.priceUsd, priceUnit: sf.priceUnit, rollSize: sf.rollSize, status: sf.status,
  }
}

function toPassportDto(p: {
  id: string; skuId: string; baseSize: string; sizeCoefficients: unknown; version: number
  components: Array<{
    id: string; role: 'MAIN' | 'RIB' | 'TRIM' | 'OTHER'; name: string | null; normBase: number; normBaseMeters: number | null
    lossCut: number; lossSew: number; allowedFabrics: Array<{ fabricId: string }>
  }>
}): PassportDto {
  return {
    id: p.id, skuId: p.skuId, baseSize: p.baseSize,
    sizeCoefficients: p.sizeCoefficients as Record<string, number>, version: p.version,
    components: p.components.map((c) => ({
      id: c.id, role: c.role, name: c.name, normBase: c.normBase, normBaseMeters: c.normBaseMeters,
      lossCut: c.lossCut, lossSew: c.lossSew, allowedFabricIds: c.allowedFabrics.map((a) => a.fabricId),
    })),
  }
}

function toSkuDto(s: {
  id: string; code: string; name: string; category: string; fit: string | null; status: string
  passport: Parameters<typeof toPassportDto>[0] | null
}): SkuDto {
  return {
    id: s.id, code: s.code, name: s.name, category: s.category, fit: s.fit, status: s.status,
    passport: s.passport ? toPassportDto(s.passport) : null,
  }
}

function toOrderDto(order: {
  id: string; mode: 'TEST' | 'ORDER'; skuId: string; sizeBreakdown: unknown; reservePct: number; defectPct: number
  componentFabricMap: unknown
  priceCurrency: 'RUB' | 'USD'; fxRate: number; result: unknown; createdAt: Date
  facts: Array<{
    id: string; fabricId: string; actualConsumed: number; wasteFabric: number; wasteSewing: number
    wasteNatural: number; producedQty: number; createdAt: Date
  }>
}): OrderDto {
  const result = order.result as unknown as CalcResult
  const byFabric = new Map(result.fabrics.map((f) => [f.fabricId, f]))
  const facts: FactDto[] = order.facts.map((f) => {
    const planned = byFabric.get(f.fabricId)
    const plannedKg = planned ? planned.needKg : null
    // actualConsumed is in the fabric's canonical unit, so compare against the plan
    // in that same unit (needM for 'm'-canonical fabrics, needKg for 'kg').
    const planCanonical = planned ? (planned.canonicalUnit === 'm' ? planned.needM : planned.needKg) : null
    const deviation = planCanonical && planCanonical > 0 ? f.actualConsumed / planCanonical - 1 : null
    return {
      id: f.id, fabricId: f.fabricId, actualConsumed: f.actualConsumed, wasteFabric: f.wasteFabric,
      wasteSewing: f.wasteSewing, wasteNatural: f.wasteNatural, producedQty: f.producedQty,
      plannedKg, deviation, createdAt: f.createdAt.toISOString(),
    }
  })
  return {
    id: order.id, mode: order.mode, skuId: order.skuId,
    sizeBreakdown: order.sizeBreakdown as Record<string, number>, reservePct: order.reservePct,
    defectPct: order.defectPct,
    componentFabricMap: order.componentFabricMap as Record<string, { fabricId: string; supplierId: string }>,
    currency: order.priceCurrency, fxRate: order.fxRate, result, createdAt: order.createdAt.toISOString(), facts,
  }
}
