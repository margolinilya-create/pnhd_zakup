import type { FabricDto } from '@web-app-demo/contracts'

// Presentation helpers for disambiguating fabrics in the UI.
//
// The reference data holds several rows that share a `name` (e.g. 10 different
// "Кулирка" variants) and differ only by `composition` + `densityGsm`. Showing
// `name` alone makes them indistinguishable, so every fabric picker/table should
// surface composition and grammage.

type FabricLike = Pick<FabricDto, 'name' | 'composition' | 'densityGsm' | 'widthCm'>

export type FabricTypeGroup<T extends FabricLike = FabricDto> = {
  key: string
  label: string
  fabrics: T[]
}

/** Stable grouping key for the "fabric type" step: name + composition. */
export function fabricTypeKey(f: Pick<FabricLike, 'name' | 'composition'>): string {
  return `${f.name}|||${f.composition ?? ''}`
}

/** Human label for the "fabric type" step (step 1 of the two-step picker). */
export function fabricTypeLabel(f: Pick<FabricLike, 'name' | 'composition'>): string {
  return f.composition ? `${f.name} · ${f.composition}` : f.name
}

/** Full single-line label: `Кулирка · 92/8 хб/лайкра · 180 г/м²`. */
export function formatFabricLabel(f: FabricLike | null | undefined): string | undefined {
  if (!f) return undefined
  const parts = [f.name]
  if (f.composition) parts.push(f.composition)
  parts.push(`${f.densityGsm} г/м²`)
  return parts.join(' · ')
}

/**
 * Density label for the grammage step. Within a group densities are normally
 * unique; if two variants share the same density, the width disambiguates them.
 */
export function fabricDensityLabel(f: FabricLike, group: FabricLike[]): string {
  const base = `${f.densityGsm} г/м²`
  const sameDensity = group.filter((g) => g.densityGsm === f.densityGsm)
  return sameDensity.length > 1 ? `${base} · ${f.widthCm} см` : base
}

/**
 * Group fabrics by type (name + composition), ordered by label; within each
 * group, variants are sorted by ascending density. Generic so callers keep
 * their original element type (FabricDto) on the way out.
 */
export function groupFabricsByType<T extends FabricLike>(fabrics: T[]): FabricTypeGroup<T>[] {
  const byKey = new Map<string, FabricTypeGroup<T>>()
  for (const f of fabrics) {
    const key = fabricTypeKey(f)
    let group = byKey.get(key)
    if (!group) {
      group = { key, label: fabricTypeLabel(f), fabrics: [] }
      byKey.set(key, group)
    }
    group.fabrics.push(f)
  }
  const groups = [...byKey.values()]
  for (const g of groups) {
    g.fabrics.sort((a, b) => a.densityGsm - b.densityGsm)
  }
  groups.sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  return groups
}
