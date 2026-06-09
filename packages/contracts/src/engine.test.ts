import { describe, expect, test } from 'bun:test'

import { computeProcurement } from './index'
import type { CalcInput, CalcRefs } from './index'

// --- Golden case: hoodie, 2 components (Футер + Рибана), batch M40/L30/XL20, reserve 5%.
// Expected values were independently derived three ways and cross-checked (ТЗ §6).

const goldenRefs: CalcRefs = {
  passport: {
    skuId: 'sku_hoodie',
    baseSize: 'M',
    version: 1,
    sizeCoefficients: { XS: 0.85, S: 0.92, M: 1.0, L: 1.09, XL: 1.18, XXL: 1.28 },
    components: [
      { componentId: 'c_main', role: 'MAIN', normBase: 0.65, lossCut: 0.05, lossSew: 0.02, allowedFabricIds: ['f_footer'] },
      { componentId: 'c_rib', role: 'RIB', normBase: 0.08, lossCut: 0.05, lossSew: 0.03, allowedFabricIds: ['f_ribana'] },
    ],
  },
  fabrics: [
    { id: 'f_footer', name: 'Футер', category: 'Футер', canonicalUnit: 'kg', densityGsm: 320, widthCm: 180, preShrink: 0.06, rollSize: 25, rollUnit: 'kg' },
    { id: 'f_ribana', name: 'Рибана', category: 'Рибана', canonicalUnit: 'kg', densityGsm: 220, widthCm: 90, preShrink: 0.05, rollSize: 25, rollUnit: 'kg' },
  ],
  supplierFabrics: [
    { supplierId: 's1', fabricId: 'f_footer', priceRub: 580, priceUsd: 6.3, priceUnit: 'kg' },
    { supplierId: 's1', fabricId: 'f_ribana', priceRub: 517, priceUsd: 5.6, priceUnit: 'kg' },
  ],
}

const goldenInput: CalcInput = {
  skuId: 'sku_hoodie',
  sizeBreakdown: { M: 40, L: 30, XL: 20 },
  componentSelections: [
    { componentId: 'c_main', fabricId: 'f_footer', supplierId: 's1' },
    { componentId: 'c_rib', fabricId: 'f_ribana', supplierId: 's1' },
  ],
  reservePct: 0.05,
  currency: 'RUB',
  fxRate: 1,
}

describe('procurement engine — golden case', () => {
  const result = computeProcurement(goldenInput, goldenRefs)
  const footer = result.fabrics.find((f) => f.fabricId === 'f_footer')!
  const ribana = result.fabrics.find((f) => f.fabricId === 'f_ribana')!

  test('aggregate inputs', () => {
    expect(result.totalGarments).toBe(90)
    expect(result.sizeWeightedQty).toBeCloseTo(96.3, 6)
    expect(result.perekos).toBe(1)
    expect(result.fabrics).toHaveLength(2)
  })

  test('Футер (MAIN): width 180 → no width effect; 3 rolls of 25kg = 75kg', () => {
    expect(footer.components[0].widthEffect).toBe(1)
    expect(footer.needKg).toBeCloseTo(70.995249, 5)
    expect(footer.needM).toBeCloseTo(123.2556, 3)
    expect(footer.rollsCount).toBe(3)
    expect(footer.orderQty).toBe(75)
    expect(footer.costRub).toBe(43500)
  })

  test('Рибана (RIB): kg width effect 1.025; 1 roll of 25kg = 25kg', () => {
    expect(ribana.components[0].widthEffect).toBeCloseTo(1.025, 6)
    expect(ribana.needKg).toBeCloseTo(8.9547444, 6)
    expect(ribana.needM).toBeCloseTo(45.225982, 3)
    expect(ribana.rollsCount).toBe(1)
    expect(ribana.orderQty).toBe(25)
    expect(ribana.costRub).toBe(12925)
  })

  test('total cost', () => {
    expect(result.totalCostRub).toBe(56425)
  })
})

describe('procurement engine — USD pricing branch', () => {
  test('uses priceUsd × fxRate', () => {
    const result = computeProcurement({ ...goldenInput, currency: 'USD', fxRate: 100 }, goldenRefs)
    const footer = result.fabrics.find((f) => f.fabricId === 'f_footer')!
    const ribana = result.fabrics.find((f) => f.fabricId === 'f_ribana')!
    expect(footer.costRub).toBe(47250) // 75 × 6.3 × 100
    expect(ribana.costRub).toBe(14000) // 25 × 5.6 × 100
    expect(result.totalCostRub).toBe(61250)
  })
})

describe('procurement engine — one fabric used in two roles is summed (step 3)', () => {
  const refs: CalcRefs = {
    passport: {
      skuId: 'sku_two_roles',
      baseSize: 'M',
      version: 1,
      sizeCoefficients: { M: 1, L: 1 },
      components: [
        { componentId: 'c1', role: 'MAIN', normBase: 1.0, lossCut: 0, lossSew: 0, allowedFabricIds: ['fx'] },
        { componentId: 'c2', role: 'TRIM', normBase: 0.5, lossCut: 0, lossSew: 0, allowedFabricIds: ['fx'] },
      ],
    },
    fabrics: [{ id: 'fx', name: 'X', category: 'X', canonicalUnit: 'kg', densityGsm: 200, widthCm: 180, preShrink: 0, rollSize: 100, rollUnit: 'kg' }],
    supplierFabrics: [{ supplierId: 's1', fabricId: 'fx', priceRub: 100, priceUnit: 'kg' }],
  }
  const input: CalcInput = {
    skuId: 'sku_two_roles',
    sizeBreakdown: { M: 10, L: 10 },
    componentSelections: [
      { componentId: 'c1', fabricId: 'fx', supplierId: 's1' },
      { componentId: 'c2', fabricId: 'fx', supplierId: 's1' },
    ],
    reservePct: 0,
    currency: 'RUB',
    fxRate: 1,
  }

  test('two components on one fabric collapse to one fabric line, net summed', () => {
    const result = computeProcurement(input, refs)
    expect(result.perekos).toBe(1) // maxShare 0.5, not > 0.5
    expect(result.fabrics).toHaveLength(1)
    const fx = result.fabrics[0]
    expect(fx.components).toHaveLength(2)
    expect(fx.needKg).toBeCloseTo(30, 9) // 20 + 10
    expect(fx.rollsCount).toBe(1)
    expect(fx.orderQty).toBe(100)
    expect(fx.costRub).toBe(10000)
  })
})

describe('procurement engine — canonical "m" width branch', () => {
  const refs: CalcRefs = {
    passport: {
      skuId: 'sku_m',
      baseSize: 'M',
      version: 1,
      sizeCoefficients: { M: 1, L: 1 },
      components: [{ componentId: 'c', role: 'MAIN', normBase: 0.5, lossCut: 0, lossSew: 0, allowedFabricIds: ['fm'] }],
    },
    fabrics: [{ id: 'fm', name: 'M', category: 'M', canonicalUnit: 'm', densityGsm: 200, widthCm: 90, preShrink: 0, rollSize: 50, rollUnit: 'm' }],
    supplierFabrics: [{ supplierId: 's1', fabricId: 'fm', priceRub: 30, priceUnit: 'm' }],
  }
  const input: CalcInput = {
    skuId: 'sku_m',
    sizeBreakdown: { M: 10, L: 10 },
    componentSelections: [{ componentId: 'c', fabricId: 'fm', supplierId: 's1' }],
    reservePct: 0,
    currency: 'RUB',
    fxRate: 1,
  }

  test('widthEffect = REF_WIDTH/width; need in meters primary, kg derived', () => {
    const result = computeProcurement(input, refs)
    const fm = result.fabrics[0]
    expect(fm.components[0].widthEffect).toBeCloseTo(2.0, 9) // 180/90
    expect(fm.needM).toBeCloseTo(20, 9) // 0.5 × 20 × 2.0
    expect(fm.needKg).toBeCloseTo(3.6, 9) // 20 × (0.9 × 200 / 1000)
    expect(fm.rollsCount).toBe(1)
    expect(fm.orderQty).toBe(50)
    expect(fm.costRub).toBe(1500) // 50 × 30
  })
})

describe('procurement engine — roll rounding boundary (exact multiple → no extra roll)', () => {
  const refs: CalcRefs = {
    passport: {
      skuId: 'sku_b',
      baseSize: 'M',
      version: 1,
      sizeCoefficients: { M: 1, L: 1 },
      components: [{ componentId: 'c', role: 'MAIN', normBase: 1.0, lossCut: 0, lossSew: 0, allowedFabricIds: ['fb'] }],
    },
    fabrics: [{ id: 'fb', name: 'B', category: 'B', canonicalUnit: 'kg', densityGsm: 200, widthCm: 180, preShrink: 0, rollSize: 50, rollUnit: 'kg' }],
    supplierFabrics: [{ supplierId: 's1', fabricId: 'fb', priceRub: 10, priceUnit: 'kg' }],
  }
  const input: CalcInput = {
    skuId: 'sku_b',
    sizeBreakdown: { M: 50, L: 50 },
    componentSelections: [{ componentId: 'c', fabricId: 'fb', supplierId: 's1' }],
    reservePct: 0,
    currency: 'RUB',
    fxRate: 1,
  }

  test('need exactly 100kg with rollSize 50 → exactly 2 rolls, not 3', () => {
    const result = computeProcurement(input, refs)
    const fb = result.fabrics[0]
    expect(fb.needKg).toBeCloseTo(100, 9)
    expect(fb.rollsCount).toBe(2)
    expect(fb.orderQty).toBe(100)
  })
})

describe('procurement engine — perekos when one size dominates (>50%)', () => {
  const refs: CalcRefs = {
    passport: {
      skuId: 'sku_p',
      baseSize: 'M',
      version: 1,
      sizeCoefficients: { M: 1, L: 1 },
      components: [{ componentId: 'c', role: 'MAIN', normBase: 1.0, lossCut: 0, lossSew: 0, allowedFabricIds: ['fp'] }],
    },
    fabrics: [{ id: 'fp', name: 'P', category: 'P', canonicalUnit: 'kg', densityGsm: 200, widthCm: 180, preShrink: 0, rollSize: 1000, rollUnit: 'kg' }],
    supplierFabrics: [{ supplierId: 's1', fabricId: 'fp', priceRub: 1, priceUnit: 'kg' }],
  }
  const input: CalcInput = {
    skuId: 'sku_p',
    sizeBreakdown: { M: 60, L: 40 },
    componentSelections: [{ componentId: 'c', fabricId: 'fp', supplierId: 's1' }],
    reservePct: 0,
    currency: 'RUB',
    fxRate: 1,
  }

  test('maxShare 0.6 → perekos 1.01 and net scaled by it', () => {
    const result = computeProcurement(input, refs)
    expect(result.perekos).toBeCloseTo(1.01, 9) // 1 + (0.6 - 0.5) × 0.1
    expect(result.fabrics[0].needKg).toBeCloseTo(101, 6) // 100 × 1.01
  })
})

describe('procurement engine — determinism and validation', () => {
  test('two calls with the same input produce byte-identical results', () => {
    const a = computeProcurement(goldenInput, goldenRefs)
    const b = computeProcurement(goldenInput, goldenRefs)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  test('throws on a size without a coefficient', () => {
    expect(() =>
      computeProcurement({ ...goldenInput, sizeBreakdown: { M: 10, XXXL: 5 } }, goldenRefs),
    ).toThrow(/size coefficient/i)
  })
})
