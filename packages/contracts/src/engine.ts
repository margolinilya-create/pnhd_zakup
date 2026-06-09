import type {
  CalcInput,
  CalcRefs,
  CalcResult,
  CanonicalUnit,
  ComponentFactor,
  Fabric,
  FabricResult,
  SupplierFabric,
} from './domain'

// Pure procurement engine (specs/tz-calculator.md §6). No IO, no Prisma, no env.
// The order of steps is fixed for determinism; no intermediate value is rounded
// except the roll-count step (ceil).

const REF_WIDTH = 180

// Round before ceil to absorb float noise so an exact multiple does not spill into an extra roll.
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

function kgPerMeter(fabric: Fabric): number {
  return ((fabric.widthCm / 100) * fabric.densityGsm) / 1000
}

function convert(qty: number, from: CanonicalUnit, to: CanonicalUnit, kgPerM: number): number {
  if (from === to) return qty
  return from === 'kg' ? qty / kgPerM : qty * kgPerM
}

export function computeProcurement(input: CalcInput, refs: CalcRefs): CalcResult {
  const { passport, fabrics, supplierFabrics } = refs

  const fabricById = new Map(fabrics.map((f) => [f.id, f]))
  const componentById = new Map(passport.components.map((c) => [c.componentId, c]))
  const supplierFabricByKey = new Map(
    supplierFabrics.map((sf) => [`${sf.supplierId}:${sf.fabricId}`, sf]),
  )

  // Step 1 prep: size-weighted quantity + size-mix skew (perekos).
  let totalGarments = 0
  let sizeWeightedQty = 0
  let maxQty = 0
  for (const [size, qtyRaw] of Object.entries(input.sizeBreakdown)) {
    const qty = qtyRaw ?? 0
    totalGarments += qty
    if (qty > maxQty) maxQty = qty
    const coef = passport.sizeCoefficients[size]
    if (coef === undefined) {
      throw new Error(`Missing size coefficient for "${size}" in passport ${passport.skuId}`)
    }
    sizeWeightedQty += coef * qty
  }
  const maxShare = totalGarments > 0 ? maxQty / totalGarments : 0
  const perekos = maxShare > 0.5 ? 1 + (maxShare - 0.5) * 0.1 : 1

  // Steps 1-2 per component, grouped by fabric (step 3).
  type Group = {
    fabric: Fabric
    supplierFabric: SupplierFabric
    netCanonical: number
    components: ComponentFactor[]
  }
  const groups = new Map<string, Group>()
  const order: string[] = []

  for (const sel of input.componentSelections) {
    const component = componentById.get(sel.componentId)
    if (!component) throw new Error(`Component ${sel.componentId} not found in passport`)
    const fabric = fabricById.get(sel.fabricId)
    if (!fabric) throw new Error(`Fabric ${sel.fabricId} not found in refs`)
    const supplierFabric = supplierFabricByKey.get(`${sel.supplierId}:${sel.fabricId}`)
    if (!supplierFabric) {
      throw new Error(`SupplierFabric ${sel.supplierId}/${sel.fabricId} not found in refs`)
    }

    const widthEffect =
      fabric.canonicalUnit === 'm'
        ? REF_WIDTH / fabric.widthCm
        : 1 + Math.max(0, (REF_WIDTH - fabric.widthCm) / REF_WIDTH) * 0.05
    const layoutCoef = perekos * widthEffect
    const rawQty = component.normBase * sizeWeightedQty
    const lossFactor = 1 + component.lossCut + component.lossSew
    const preShrinkFactor = 1 + fabric.preShrink
    const netQty = rawQty * layoutCoef * lossFactor * preShrinkFactor

    const factor: ComponentFactor = {
      componentId: component.componentId,
      role: component.role,
      fabricId: fabric.id,
      sizeWeightedQty,
      rawQty,
      perekos,
      widthEffect,
      layoutCoef,
      lossFactor,
      preShrinkFactor,
      netQty,
    }

    const existing = groups.get(fabric.id)
    if (existing) {
      existing.netCanonical += netQty
      existing.components.push(factor)
    } else {
      groups.set(fabric.id, { fabric, supplierFabric, netCanonical: netQty, components: [factor] })
      order.push(fabric.id)
    }
  }

  // Steps 4-7 per fabric.
  const fabricResults: FabricResult[] = []
  let totalCostRub = 0

  for (const fabricId of order) {
    const group = groups.get(fabricId)!
    const { fabric, supplierFabric, netCanonical } = group
    const canon = fabric.canonicalUnit
    const kgPerM = kgPerMeter(fabric)

    const needKg = convert(netCanonical, canon, 'kg', kgPerM)
    const needM = convert(netCanonical, canon, 'm', kgPerM)
    const reserveCanonical = netCanonical * input.reservePct
    const reserveKg = convert(reserveCanonical, canon, 'kg', kgPerM)
    const reserveM = convert(reserveCanonical, canon, 'm', kgPerM)

    const toBuyCanonical = netCanonical * (1 + input.reservePct) // step 4 (no stock) + step 5
    const rollUnit = fabric.rollUnit
    const rollSize = supplierFabric.rollSize ?? fabric.rollSize
    const toBuyRoll = convert(toBuyCanonical, canon, rollUnit, kgPerM)
    const rollsCount = Math.ceil(roundTo(toBuyRoll / rollSize, 9)) // step 6
    const orderQty = rollsCount * rollSize
    const orderQtyKg = convert(orderQty, rollUnit, 'kg', kgPerM)
    const orderQtyM = convert(orderQty, rollUnit, 'm', kgPerM)

    // step 7: cost
    const priceUnit = supplierFabric.priceUnit
    const pricePerUnit = input.currency === 'RUB' ? supplierFabric.priceRub : supplierFabric.priceUsd
    if (pricePerUnit === undefined || pricePerUnit === null) {
      throw new Error(
        `Missing ${input.currency} price for fabric ${fabric.id} from supplier ${supplierFabric.supplierId}`,
      )
    }
    const orderQtyInPriceUnit = convert(orderQty, rollUnit, priceUnit, kgPerM)
    const costNative = orderQtyInPriceUnit * pricePerUnit
    const costRub = input.currency === 'USD' ? costNative * input.fxRate : costNative
    totalCostRub += costRub

    fabricResults.push({
      fabricId: fabric.id,
      fabricName: fabric.name,
      canonicalUnit: canon,
      needKg,
      needM,
      reserveKg,
      reserveM,
      rollUnit,
      rollSize,
      rollsCount,
      orderQty,
      orderQtyKg,
      orderQtyM,
      priceUnit,
      pricePerUnit,
      priceCurrency: input.currency,
      costRub,
      components: group.components,
    })
  }

  return {
    skuId: passport.skuId,
    totalGarments,
    sizeWeightedQty,
    perekos,
    reservePct: input.reservePct,
    currency: input.currency,
    fxRate: input.fxRate,
    fabrics: fabricResults,
    totalCostRub,
  }
}
