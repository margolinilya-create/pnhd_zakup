import { z } from 'zod'

// Procurement-calculator domain contracts (see specs/tz-calculator.md §5-7).
// camelCase to match the existing contracts style; the Prisma layer maps to snake_case.

export const canonicalUnitSchema = z.enum(['kg', 'm'])
export const priceCurrencySchema = z.enum(['RUB', 'USD'])
export const componentRoleSchema = z.enum(['MAIN', 'RIB', 'TRIM', 'OTHER'])

export type CanonicalUnit = z.infer<typeof canonicalUnitSchema>
export type PriceCurrency = z.infer<typeof priceCurrencySchema>
export type ComponentRole = z.infer<typeof componentRoleSchema>

// --- Reference data (engine input snapshot) ---

export const fabricSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  canonicalUnit: canonicalUnitSchema,
  densityGsm: z.number().positive(),
  widthCm: z.number().positive(),
  preShrink: z.number().min(0), // fraction, e.g. 0.06
  rollSize: z.number().positive(),
  rollUnit: canonicalUnitSchema,
})

export const supplierFabricSchema = z.object({
  supplierId: z.string(),
  fabricId: z.string(),
  priceRub: z.number().nonnegative().nullable().optional(),
  priceUsd: z.number().nonnegative().nullable().optional(),
  priceUnit: canonicalUnitSchema,
  rollSize: z.number().positive().nullable().optional(), // overrides fabric.rollSize when set
})

export const passportComponentSchema = z.object({
  componentId: z.string(),
  role: componentRoleSchema,
  name: z.string().nullish(), // human label, e.g. "Подкладка", "Карман" (role stays the coarse category)
  normBase: z.number().nonnegative(), // per base-size garment, in the fabric canonical unit
  lossCut: z.number().min(0),
  lossSew: z.number().min(0),
  allowedFabricIds: z.array(z.string()),
})

export const productPassportSchema = z.object({
  skuId: z.string(),
  baseSize: z.string(),
  sizeCoefficients: z.record(z.string(), z.number().positive()),
  version: z.number().int(),
  components: z.array(passportComponentSchema).min(1),
})

// --- Calculation input ---

export const componentSelectionSchema = z.object({
  componentId: z.string(),
  fabricId: z.string(),
  supplierId: z.string(),
})

export const calcInputSchema = z.object({
  skuId: z.string(),
  sizeBreakdown: z.record(z.string(), z.number().int().nonnegative()),
  componentSelections: z.array(componentSelectionSchema).min(1).max(100),
  reservePct: z.number().min(0), // safety stock buffer
  defectPct: z.number().min(0).optional(), // planned defect/scrap buffer (separate from reserve); engine treats missing as 0
  currency: priceCurrencySchema,
  fxRate: z.number().positive(), // USD->RUB; use 1 for RUB
})

export const calcRefsSchema = z.object({
  passport: productPassportSchema,
  fabrics: z.array(fabricSchema),
  supplierFabrics: z.array(supplierFabricSchema),
})

// --- Calculation result ---

export const componentFactorSchema = z.object({
  componentId: z.string(),
  role: componentRoleSchema,
  componentName: z.string().nullish(),
  fabricId: z.string(),
  sizeWeightedQty: z.number(),
  rawQty: z.number(), // canonical unit
  perekos: z.number(),
  widthEffect: z.number(),
  layoutCoef: z.number(),
  lossFactor: z.number(), // 1 + lossCut + lossSew
  preShrinkFactor: z.number(), // 1 + preShrink
  netQty: z.number(), // canonical unit
})

export const fabricResultSchema = z.object({
  fabricId: z.string(),
  fabricName: z.string(),
  canonicalUnit: canonicalUnitSchema,
  needKg: z.number(),
  needM: z.number(),
  reserveKg: z.number(),
  reserveM: z.number(),
  defectKg: z.number().default(0),
  defectM: z.number().default(0),
  rollUnit: canonicalUnitSchema,
  rollSize: z.number(),
  rollsCount: z.number().int(),
  orderQty: z.number(), // in rollUnit, rounded up to whole rolls
  orderQtyKg: z.number(),
  orderQtyM: z.number(),
  priceUnit: canonicalUnitSchema,
  pricePerUnit: z.number(),
  priceCurrency: priceCurrencySchema,
  costRub: z.number(),
  components: z.array(componentFactorSchema),
})

export const calcResultSchema = z.object({
  skuId: z.string(),
  totalGarments: z.number().int(),
  sizeWeightedQty: z.number(),
  perekos: z.number(),
  reservePct: z.number(),
  defectPct: z.number().default(0),
  currency: priceCurrencySchema,
  fxRate: z.number(),
  fabrics: z.array(fabricResultSchema),
  totalCostRub: z.number(),
})

export type Fabric = z.infer<typeof fabricSchema>
export type SupplierFabric = z.infer<typeof supplierFabricSchema>
export type PassportComponent = z.infer<typeof passportComponentSchema>
export type ProductPassport = z.infer<typeof productPassportSchema>
export type ComponentSelection = z.infer<typeof componentSelectionSchema>
export type CalcInput = z.infer<typeof calcInputSchema>
export type CalcRefs = z.infer<typeof calcRefsSchema>
export type ComponentFactor = z.infer<typeof componentFactorSchema>
export type FabricResult = z.infer<typeof fabricResultSchema>
export type CalcResult = z.infer<typeof calcResultSchema>
