import { expect, test } from 'bun:test'

import {
  fabricDensityLabel,
  fabricTypeKey,
  fabricTypeLabel,
  formatFabricLabel,
  groupFabricsByType,
} from '../src/lib/fabric'

type TestFabric = { id: string; name: string; composition: string | null; densityGsm: number; widthCm: number }

function fab(id: string, name: string, composition: string | null, densityGsm: number, widthCm = 180): TestFabric {
  return { id, name, composition, densityGsm, widthCm }
}

// Mirrors the real seed: name "Кулирка" spans two compositions with overlapping
// densities (180 g/m² exists for both), so name+composition is the grouping key.
const KULIRKA_LYCRA_180 = fab('FAB004', 'Кулирка', '92/8 хб/лайкра', 180)
const KULIRKA_LYCRA_165 = fab('FAB003', 'Кулирка', '92/8 хб/лайкра', 165)
const KULIRKA_LYCRA_200 = fab('FAB005', 'Кулирка', '92/8 хб/лайкра', 200)
const KULIRKA_COTTON_180 = fab('FAB008', 'Кулирка', '100% хб', 180)
const KULIRKA_COTTON_230 = fab('FAB010', 'Кулирка', '100% хб', 230)
const FOOTER = fab('FAB001', 'Футер 3-х нитка Начес', '70/30 хб/пэ', 320)

test('formatFabricLabel includes name, composition and density', () => {
  expect(formatFabricLabel(KULIRKA_LYCRA_180)).toBe('Кулирка · 92/8 хб/лайкра · 180 г/м²')
})

test('formatFabricLabel omits composition when missing', () => {
  expect(formatFabricLabel(fab('X', 'Рибана', null, 220, 90))).toBe('Рибана · 220 г/м²')
})

test('formatFabricLabel returns undefined for missing fabric', () => {
  expect(formatFabricLabel(undefined)).toBeUndefined()
  expect(formatFabricLabel(null)).toBeUndefined()
})

test('fabricTypeKey / fabricTypeLabel split Кулирка by composition', () => {
  expect(fabricTypeKey(KULIRKA_LYCRA_180)).not.toBe(fabricTypeKey(KULIRKA_COTTON_180))
  expect(fabricTypeLabel(KULIRKA_LYCRA_180)).toBe('Кулирка · 92/8 хб/лайкра')
  expect(fabricTypeLabel(KULIRKA_COTTON_180)).toBe('Кулирка · 100% хб')
})

test('groupFabricsByType separates compositions and sorts by ascending density', () => {
  const groups = groupFabricsByType([
    KULIRKA_LYCRA_200,
    KULIRKA_COTTON_230,
    KULIRKA_LYCRA_165,
    KULIRKA_COTTON_180,
    KULIRKA_LYCRA_180,
    FOOTER,
  ])

  // Two Кулирка groups + one Футер group.
  expect(groups.map((g) => g.label)).toEqual([
    'Кулирка · 100% хб',
    'Кулирка · 92/8 хб/лайкра',
    'Футер 3-х нитка Начес · 70/30 хб/пэ',
  ])

  const lycra = groups.find((g) => g.key === fabricTypeKey(KULIRKA_LYCRA_180))!
  expect(lycra.fabrics.map((f) => f.densityGsm)).toEqual([165, 180, 200])

  const cotton = groups.find((g) => g.key === fabricTypeKey(KULIRKA_COTTON_180))!
  expect(cotton.fabrics.map((f) => f.densityGsm)).toEqual([180, 230])
})

test('fabricDensityLabel disambiguates equal densities by width', () => {
  const wide = fab('W', 'Пике', '100% хб', 190, 180)
  const narrow = fab('N', 'Пике', '100% хб', 190, 90)
  const group = [wide, narrow]
  expect(fabricDensityLabel(wide, group)).toBe('190 г/м² · 180 см')
  expect(fabricDensityLabel(narrow, group)).toBe('190 г/м² · 90 см')

  // Unique density → no width suffix.
  expect(fabricDensityLabel(KULIRKA_LYCRA_165, [KULIRKA_LYCRA_165, KULIRKA_LYCRA_180])).toBe('165 г/м²')
})
