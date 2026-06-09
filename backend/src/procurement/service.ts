import {
  computeProcurement,
  type CalcInput,
  type CalcRefs,
  type CalcResult,
  type FabricDto,
  type FactDto,
  type OrderDto,
  type OrderMode,
  type OrderSummaryDto,
  type PassportDto,
  type SkuDto,
  type SupplierDto,
  type SupplierFabricDto,
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

    const fabricRows = await this.db.fabric.findMany({ where: { id: { in: [...fabricIds] } } })
    if (fabricRows.length !== fabricIds.size) {
      throw new AppError(400, 'VALIDATION_ERROR', 'One or more selected fabrics were not found')
    }

    const supplierFabricRows = await this.db.supplierFabric.findMany({
      where: {
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

  async createOrder(input: CalcInput, mode: OrderMode, userId: string): Promise<OrderDto> {
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
    userId: string,
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
    id: string; role: 'MAIN' | 'RIB' | 'TRIM' | 'OTHER'; normBase: number; normBaseMeters: number | null
    lossCut: number; lossSew: number; allowedFabrics: Array<{ fabricId: string }>
  }>
}): PassportDto {
  return {
    id: p.id, skuId: p.skuId, baseSize: p.baseSize,
    sizeCoefficients: p.sizeCoefficients as Record<string, number>, version: p.version,
    components: p.components.map((c) => ({
      id: c.id, role: c.role, normBase: c.normBase, normBaseMeters: c.normBaseMeters,
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
  id: string; mode: 'TEST' | 'ORDER'; skuId: string; sizeBreakdown: unknown; reservePct: number
  priceCurrency: 'RUB' | 'USD'; fxRate: number; result: unknown; createdAt: Date
  facts: Array<{
    id: string; fabricId: string; actualConsumed: number; wasteFabric: number; wasteSewing: number
    wasteNatural: number; producedQty: number; createdAt: Date
  }>
}): OrderDto {
  const result = order.result as unknown as CalcResult
  const plannedByFabric = new Map(result.fabrics.map((f) => [f.fabricId, f.needKg]))
  const facts: FactDto[] = order.facts.map((f) => {
    const plannedKg = plannedByFabric.get(f.fabricId) ?? null
    const deviation = plannedKg && plannedKg > 0 ? f.actualConsumed / plannedKg - 1 : null
    return {
      id: f.id, fabricId: f.fabricId, actualConsumed: f.actualConsumed, wasteFabric: f.wasteFabric,
      wasteSewing: f.wasteSewing, wasteNatural: f.wasteNatural, producedQty: f.producedQty,
      plannedKg, deviation, createdAt: f.createdAt.toISOString(),
    }
  })
  return {
    id: order.id, mode: order.mode, skuId: order.skuId,
    sizeBreakdown: order.sizeBreakdown as Record<string, number>, reservePct: order.reservePct,
    currency: order.priceCurrency, fxRate: order.fxRate, result, createdAt: order.createdAt.toISOString(), facts,
  }
}
