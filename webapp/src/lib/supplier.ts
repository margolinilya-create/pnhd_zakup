import type { PriceCurrency, SupplierDto, SupplierFabricDto } from '@web-app-demo/contracts'

// Supplier auto-selection for the calculator.
//
// Prices live on the supplier×fabric edge (priceRub or priceUsd; see ТЗ §5.3).
// The calculator settles cost in ₽, so "cheapest" ranks by the rouble-equivalent
// the buyer would actually pay given the active currency and fx rate. "fastest"
// ranks by the supplier's lead time. These are pure helpers so the picking rule
// stays testable away from the React state.

export type SupplierPickMode = 'cheapest' | 'fastest' | 'manual'

type PricedEdge = Pick<SupplierFabricDto, 'priceRub' | 'priceUsd'>

/** Rouble-equivalent unit price used for ranking, or null when no price is set. */
export function effectivePriceRub(edge: PricedEdge, currency: PriceCurrency, fxRate: number): number | null {
  const usdAsRub = edge.priceUsd != null ? edge.priceUsd * fxRate : null
  if (currency === 'USD') return usdAsRub ?? edge.priceRub ?? null
  return edge.priceRub ?? usdAsRub
}

function edgesForFabric(fabricId: string, supplierFabrics: SupplierFabricDto[]): SupplierFabricDto[] {
  return supplierFabrics.filter((sf) => sf.fabricId === fabricId)
}

/** Cheapest supplier id for a fabric, or '' when there are no edges. Ties keep the first edge. */
export function cheapestSupplierFor(
  fabricId: string,
  supplierFabrics: SupplierFabricDto[],
  currency: PriceCurrency,
  fxRate: number,
): string {
  const edges = edgesForFabric(fabricId, supplierFabrics)
  if (edges.length === 0) return ''
  let best = edges[0]
  let bestPrice = effectivePriceRub(best, currency, fxRate)
  for (const sf of edges.slice(1)) {
    const price = effectivePriceRub(sf, currency, fxRate)
    if (price == null) continue
    if (bestPrice == null || price < bestPrice) {
      best = sf
      bestPrice = price
    }
  }
  return best.supplierId
}

/** Fastest supplier id for a fabric by lead time, or '' when there are no edges. Unknown lead times rank last. */
export function fastestSupplierFor(
  fabricId: string,
  supplierFabrics: SupplierFabricDto[],
  suppliers: Pick<SupplierDto, 'id' | 'leadTimeDays'>[],
): string {
  const edges = edgesForFabric(fabricId, supplierFabrics)
  if (edges.length === 0) return ''
  const leadById = new Map(suppliers.map((s) => [s.id, s.leadTimeDays]))
  let best = edges[0]
  let bestLead = leadById.get(best.supplierId) ?? null
  for (const sf of edges.slice(1)) {
    const lead = leadById.get(sf.supplierId) ?? null
    if (lead == null) continue
    if (bestLead == null || lead < bestLead) {
      best = sf
      bestLead = lead
    }
  }
  return best.supplierId
}

/** Pick a supplier id for a fabric according to the mode. Manual keeps the first available edge. */
export function pickSupplierFor(
  mode: SupplierPickMode,
  fabricId: string,
  supplierFabrics: SupplierFabricDto[],
  suppliers: Pick<SupplierDto, 'id' | 'leadTimeDays'>[],
  currency: PriceCurrency,
  fxRate: number,
): string {
  if (mode === 'fastest') return fastestSupplierFor(fabricId, supplierFabrics, suppliers)
  if (mode === 'cheapest') return cheapestSupplierFor(fabricId, supplierFabrics, currency, fxRate)
  return edgesForFabric(fabricId, supplierFabrics)[0]?.supplierId ?? ''
}
