import { z } from 'zod'

import {
  calcInputSchema,
  calcResultSchema,
  canonicalUnitSchema,
  componentRoleSchema,
  priceCurrencySchema,
} from './domain'

// API DTOs for the procurement calculator (read reference data, calc, immutable orders, facts).
// Reuses the engine contracts from domain.ts (calcInputSchema / calcResultSchema).

export const orderModeSchema = z.enum(['TEST', 'ORDER'])
export type OrderMode = z.infer<typeof orderModeSchema>

// --- Reference read DTOs ---

export const fabricDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: z.string(),
  composition: z.string().nullable(),
  canonicalUnit: canonicalUnitSchema,
  densityGsm: z.number(),
  widthCm: z.number(),
  isDefaultWidth: z.boolean(),
  preShrink: z.number(),
  isDefaultShrink: z.boolean(),
  rollSize: z.number(),
  rollUnit: canonicalUnitSchema,
  status: z.string(),
})

export const supplierDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  country: z.string().nullable(),
  leadTimeDays: z.number().nullable(),
  status: z.string(),
})

export const supplierFabricDtoSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  fabricId: z.string(),
  priceRub: z.number().nullable(),
  priceUsd: z.number().nullable(),
  priceUnit: canonicalUnitSchema,
  rollSize: z.number().nullable(),
  status: z.string(),
})

export const passportComponentDtoSchema = z.object({
  id: z.string(),
  role: componentRoleSchema,
  normBase: z.number(),
  normBaseMeters: z.number().nullable(),
  lossCut: z.number(),
  lossSew: z.number(),
  allowedFabricIds: z.array(z.string()),
})

export const passportDtoSchema = z.object({
  id: z.string(),
  skuId: z.string(),
  baseSize: z.string(),
  sizeCoefficients: z.record(z.string(), z.number()),
  version: z.number(),
  components: z.array(passportComponentDtoSchema),
})

export const skuDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: z.string(),
  fit: z.string().nullable(),
  status: z.string(),
  passport: passportDtoSchema.nullable(),
})

export const fabricsResponseSchema = z.object({ fabrics: z.array(fabricDtoSchema) })
export const suppliersResponseSchema = z.object({ suppliers: z.array(supplierDtoSchema) })
export const supplierFabricsResponseSchema = z.object({
  supplierFabrics: z.array(supplierFabricDtoSchema),
})
export const skusResponseSchema = z.object({ skus: z.array(skuDtoSchema) })

// single-entity write responses
export const fabricResponseSchema = z.object({ fabric: fabricDtoSchema })
export const supplierResponseSchema = z.object({ supplier: supplierDtoSchema })
export const supplierFabricResponseSchema = z.object({ supplierFabric: supplierFabricDtoSchema })
export const skuResponseSchema = z.object({ sku: skuDtoSchema })

// --- Calc ---
// Request body is the engine CalcInput; the backend builds the refs snapshot from the DB.
export const calcRequestSchema = calcInputSchema
export const calcResponseSchema = z.object({ result: calcResultSchema })

// --- Orders (immutable) ---

export const createOrderRequestSchema = calcInputSchema.extend({
  mode: orderModeSchema,
})

export const orderSummaryDtoSchema = z.object({
  id: z.string(),
  mode: orderModeSchema,
  skuId: z.string(),
  skuName: z.string().nullable(),
  totalGarments: z.number(),
  currency: priceCurrencySchema,
  totalCostRub: z.number(),
  createdAt: z.string(),
})

export const factEntrySchema = z.object({
  fabricId: z.string(),
  actualConsumed: z.number().nonnegative(),
  wasteFabric: z.number().nonnegative().default(0),
  wasteSewing: z.number().nonnegative().default(0),
  wasteNatural: z.number().nonnegative().default(0),
  producedQty: z.number().int().nonnegative(),
})

export const addFactRequestSchema = z.object({
  facts: z.array(factEntrySchema).min(1),
})

export const factDtoSchema = z.object({
  id: z.string(),
  fabricId: z.string(),
  actualConsumed: z.number(),
  wasteFabric: z.number(),
  wasteSewing: z.number(),
  wasteNatural: z.number(),
  producedQty: z.number(),
  // planned consumption for this fabric from the saved result, and deviation = actual/plan - 1
  plannedKg: z.number().nullable(),
  deviation: z.number().nullable(),
  createdAt: z.string(),
})

export const orderDtoSchema = z.object({
  id: z.string(),
  mode: orderModeSchema,
  skuId: z.string(),
  sizeBreakdown: z.record(z.string(), z.number()),
  reservePct: z.number(),
  currency: priceCurrencySchema,
  fxRate: z.number(),
  result: calcResultSchema,
  createdAt: z.string(),
  facts: z.array(factDtoSchema),
})

export const ordersResponseSchema = z.object({ orders: z.array(orderSummaryDtoSchema) })
export const orderResponseSchema = z.object({ order: orderDtoSchema })

// --- Write inputs (reference editing) ---

export const fabricInputSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  composition: z.string().trim().nullish(),
  canonicalUnit: canonicalUnitSchema.default('kg'),
  densityGsm: z.number().int().positive(),
  widthCm: z.number().int().positive(),
  isDefaultWidth: z.boolean().default(false),
  preShrink: z.number().min(0).max(1),
  isDefaultShrink: z.boolean().default(false),
  rollSize: z.number().positive(),
  rollUnit: canonicalUnitSchema.default('kg'),
})
export const fabricUpdateSchema = fabricInputSchema.partial()

export const supplierInputSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  country: z.string().trim().nullish(),
  leadTimeDays: z.number().int().nonnegative().nullish(),
})
export const supplierUpdateSchema = supplierInputSchema.partial()

export const supplierFabricInputSchema = z.object({
  supplierId: z.string().min(1),
  fabricId: z.string().min(1),
  priceRub: z.number().nonnegative().nullish(),
  priceUsd: z.number().nonnegative().nullish(),
  priceUnit: canonicalUnitSchema.default('kg'),
  rollSize: z.number().positive().nullish(),
})
export const supplierFabricUpdateSchema = z.object({
  priceRub: z.number().nonnegative().nullish(),
  priceUsd: z.number().nonnegative().nullish(),
  priceUnit: canonicalUnitSchema.optional(),
  rollSize: z.number().positive().nullish(),
})

export const skuInputSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  fit: z.string().trim().nullish(),
})
export const skuUpdateSchema = skuInputSchema.partial()

export const passportComponentInputSchema = z.object({
  role: componentRoleSchema,
  normBase: z.number().nonnegative(),
  normBaseMeters: z.number().nonnegative().nullish(),
  lossCut: z.number().min(0).max(1),
  lossSew: z.number().min(0).max(1),
  allowedFabricIds: z.array(z.string()).min(1),
})
export const passportInputSchema = z.object({
  baseSize: z.string().trim().min(1).default('M'),
  sizeCoefficients: z.record(z.string(), z.number().positive()),
  components: z.array(passportComponentInputSchema).min(1),
})

export type FabricInput = z.input<typeof fabricInputSchema>
export type FabricUpdate = z.input<typeof fabricUpdateSchema>
export type SupplierInput = z.input<typeof supplierInputSchema>
export type SupplierUpdate = z.input<typeof supplierUpdateSchema>
export type SupplierFabricInput = z.input<typeof supplierFabricInputSchema>
export type SupplierFabricUpdate = z.input<typeof supplierFabricUpdateSchema>
export type SkuInput = z.input<typeof skuInputSchema>
export type SkuUpdate = z.input<typeof skuUpdateSchema>
export type PassportInput = z.input<typeof passportInputSchema>

export type FabricDto = z.infer<typeof fabricDtoSchema>
export type SupplierDto = z.infer<typeof supplierDtoSchema>
export type SupplierFabricDto = z.infer<typeof supplierFabricDtoSchema>
export type PassportComponentDto = z.infer<typeof passportComponentDtoSchema>
export type PassportDto = z.infer<typeof passportDtoSchema>
export type SkuDto = z.infer<typeof skuDtoSchema>
export type CalcRequest = z.infer<typeof calcRequestSchema>
export type CalcResponse = z.infer<typeof calcResponseSchema>
export type CreateOrderRequest = z.input<typeof createOrderRequestSchema>
export type OrderSummaryDto = z.infer<typeof orderSummaryDtoSchema>
export type FactEntry = z.input<typeof factEntrySchema>
export type AddFactRequest = z.input<typeof addFactRequestSchema>
export type FactDto = z.infer<typeof factDtoSchema>
export type OrderDto = z.infer<typeof orderDtoSchema>
