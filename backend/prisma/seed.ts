import 'dotenv/config'

import { createPrisma } from '../src/db'

// --------------------------------------------------------------------------
// Prisma seed — REAL procurement data (claude_code_playbook.md "ПРОМТ 2").
//
// Idempotent: every record is upserted by its business key, so the script is
// safe to run multiple times (no duplicate-key errors). Passport components
// are rebuilt deterministically (deleteMany -> create) on every run.
//
// Counts (per playbook gate): 2 suppliers, 24 fabrics, 36 edges, 42 SKUs.
// --------------------------------------------------------------------------

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

const prisma = createPrisma(connectionString)

// --- Shared defaults (playbook §3) ---------------------------------------
// roll_size / roll_unit are placeholder defaults until confirmed with the user.
const ROLL_SIZE = 25
const ROLL_UNIT = 'kg' as const
const CANONICAL_UNIT = 'kg' as const

// Per-category width/pre-shrink defaults (isDefaultWidth / isDefaultShrink = true).
// Кулирка / Футер / Пике -> width 180, shrink 0.05 (BUT Футер -> shrink 0.06).
// Рибана / Кашкорсе      -> width 90, shrink 0.05.
function categoryDefaults(category: string): { widthCm: number; preShrink: number } {
  switch (category) {
    case 'Футер':
      return { widthCm: 180, preShrink: 0.06 }
    case 'Кулирка':
    case 'Пике':
      return { widthCm: 180, preShrink: 0.05 }
    case 'Рибана':
    case 'Кашкорсе':
      return { widthCm: 90, preShrink: 0.05 }
    default:
      throw new Error(`Unknown fabric category: ${category}`)
  }
}

// --- Suppliers ------------------------------------------------------------
const SUPPLIERS = [
  { code: 'SUP001', name: 'МЕДАС', country: 'RU' },
  { code: 'SUP002', name: 'КОТОНПРОМ', country: 'RU' },
] as const

// --- Fabrics (code, name, category, composition, densityGsm) --------------
const FABRICS: Array<{
  code: string
  name: string
  category: string
  composition: string
  densityGsm: number
}> = [
  { code: 'FAB001', name: 'Футер 3-х нитка Начес', category: 'Футер', composition: '70/30 хб/пэ', densityGsm: 320 },
  { code: 'FAB002', name: 'Футер 3-х нитка Петля', category: 'Футер', composition: '80/20 хб/пэ', densityGsm: 320 },
  { code: 'FAB003', name: 'Кулирка', category: 'Кулирка', composition: '92/8 хб/лайкра', densityGsm: 165 },
  { code: 'FAB004', name: 'Кулирка', category: 'Кулирка', composition: '92/8 хб/лайкра', densityGsm: 180 },
  { code: 'FAB005', name: 'Кулирка', category: 'Кулирка', composition: '92/8 хб/лайкра', densityGsm: 200 },
  { code: 'FAB006', name: 'Кулирка', category: 'Кулирка', composition: '92/8 хб/лайкра', densityGsm: 230 },
  { code: 'FAB007', name: 'Кулирка', category: 'Кулирка', composition: '92/8 хб/лайкра', densityGsm: 240 },
  { code: 'FAB008', name: 'Кулирка', category: 'Кулирка', composition: '100% хб', densityGsm: 180 },
  { code: 'FAB009', name: 'Кулирка', category: 'Кулирка', composition: '100% хб', densityGsm: 200 },
  { code: 'FAB010', name: 'Кулирка', category: 'Кулирка', composition: '100% хб', densityGsm: 230 },
  { code: 'FAB011', name: 'Кулирка', category: 'Кулирка', composition: '100% хб', densityGsm: 250 },
  { code: 'FAB012', name: 'Кулирка', category: 'Кулирка', composition: '100% хб', densityGsm: 300 },
  { code: 'FAB013', name: 'Футер 2-х нитка', category: 'Футер', composition: '92/8 хб/лайкра', densityGsm: 245 },
  { code: 'FAB014', name: 'Петля/Диагональ', category: 'Футер', composition: '80/20 хб/пэ', densityGsm: 320 },
  { code: 'FAB015', name: 'Петля/Диагональ', category: 'Футер', composition: '80/20 хб/пэ', densityGsm: 350 },
  { code: 'FAB016', name: 'Петля/Диагональ', category: 'Футер', composition: '80/20 хб/пэ', densityGsm: 400 },
  { code: 'FAB017', name: 'Петля/Диагональ', category: 'Футер', composition: '80/20 хб/пэ', densityGsm: 470 },
  { code: 'FAB018', name: 'Петля/Диагональ', category: 'Футер', composition: '80/20 хб/пэ', densityGsm: 500 },
  { code: 'FAB020', name: 'Начёс/интерсофт', category: 'Футер', composition: '65/35 хб/пэ', densityGsm: 320 },
  { code: 'FAB024', name: 'Пике', category: 'Пике', composition: '100% хб', densityGsm: 190 },
  { code: 'FAB026', name: 'Пике', category: 'Пике', composition: '100% хб', densityGsm: 215 },
  { code: 'FAB027', name: 'Пике', category: 'Пике', composition: '93/7 хб/лайкра', densityGsm: 320 },
  { code: 'FAB033', name: 'Рибана', category: 'Рибана', composition: 'состав не указан', densityGsm: 220 },
  { code: 'FAB034', name: 'Кашкорсе', category: 'Кашкорсе', composition: 'состав не указан', densityGsm: 220 },
]

// --- SupplierFabric edges (fabricCode -> [{ supplierCode, priceRub, priceUsd }]) ---
const EDGES: Array<{ fabric: string; supplier: string; priceRub: number; priceUsd: number }> = [
  { fabric: 'FAB001', supplier: 'SUP001', priceRub: 543.2, priceUsd: 5.9 },
  { fabric: 'FAB001', supplier: 'SUP002', priceRub: 535.4, priceUsd: 5.8 },
  { fabric: 'FAB002', supplier: 'SUP001', priceRub: 580.5, priceUsd: 6.3 },
  { fabric: 'FAB002', supplier: 'SUP002', priceRub: 555.7, priceUsd: 6.0 },
  { fabric: 'FAB003', supplier: 'SUP001', priceRub: 316.2, priceUsd: 3.4 },
  { fabric: 'FAB003', supplier: 'SUP002', priceRub: 317.4, priceUsd: 3.5 },
  { fabric: 'FAB004', supplier: 'SUP002', priceRub: 320.0, priceUsd: 3.5 },
  { fabric: 'FAB005', supplier: 'SUP001', priceRub: 371.5, priceUsd: 4.0 },
  { fabric: 'FAB005', supplier: 'SUP002', priceRub: 343.2, priceUsd: 3.7 },
  { fabric: 'FAB006', supplier: 'SUP001', priceRub: 441.3, priceUsd: 4.8 },
  { fabric: 'FAB007', supplier: 'SUP001', priceRub: 210.0, priceUsd: 2.3 },
  { fabric: 'FAB008', supplier: 'SUP001', priceRub: 308.1, priceUsd: 3.3 },
  { fabric: 'FAB008', supplier: 'SUP002', priceRub: 300.8, priceUsd: 3.3 },
  { fabric: 'FAB009', supplier: 'SUP001', priceRub: 371.5, priceUsd: 4.0 },
  { fabric: 'FAB009', supplier: 'SUP002', priceRub: 343.2, priceUsd: 3.7 },
  { fabric: 'FAB010', supplier: 'SUP002', priceRub: 401.1, priceUsd: 4.4 },
  { fabric: 'FAB011', supplier: 'SUP001', priceRub: 503.7, priceUsd: 5.5 },
  { fabric: 'FAB012', supplier: 'SUP001', priceRub: 686.0, priceUsd: 7.5 },
  { fabric: 'FAB012', supplier: 'SUP002', priceRub: 520.7, priceUsd: 5.7 },
  { fabric: 'FAB013', supplier: 'SUP001', priceRub: 458.0, priceUsd: 5.0 },
  { fabric: 'FAB013', supplier: 'SUP002', priceRub: 451.7, priceUsd: 4.9 },
  { fabric: 'FAB014', supplier: 'SUP001', priceRub: 580.5, priceUsd: 6.3 },
  { fabric: 'FAB015', supplier: 'SUP002', priceRub: 555.7, priceUsd: 6.0 },
  { fabric: 'FAB016', supplier: 'SUP002', priceRub: 761.8, priceUsd: 8.3 },
  { fabric: 'FAB017', supplier: 'SUP001', priceRub: 1107.3, priceUsd: 12.0 },
  { fabric: 'FAB018', supplier: 'SUP002', priceRub: 991.8, priceUsd: 10.8 },
  { fabric: 'FAB020', supplier: 'SUP002', priceRub: 552.0, priceUsd: 6.0 },
  { fabric: 'FAB024', supplier: 'SUP001', priceRub: 443.1, priceUsd: 4.8 },
  { fabric: 'FAB026', supplier: 'SUP002', priceRub: 396.5, priceUsd: 4.3 },
  { fabric: 'FAB027', supplier: 'SUP002', priceRub: 1104.0, priceUsd: 12.0 },
  { fabric: 'FAB033', supplier: 'SUP001', priceRub: 516.9, priceUsd: 5.6 },
  { fabric: 'FAB033', supplier: 'SUP002', priceRub: 1002.8, priceUsd: 10.9 },
  { fabric: 'FAB034', supplier: 'SUP001', priceRub: 573.8, priceUsd: 6.2 },
  { fabric: 'FAB034', supplier: 'SUP002', priceRub: 1002.8, priceUsd: 10.9 },
]

// --- SKUs (code, name, normBaseMeters, mapped fabric code) ----------------
const SKUS: Array<{ code: string; name: string; normMeters: number; fabric: string }> = [
  { code: 'SKU001', name: 'Футболка Classic woman', normMeters: 0.8, fabric: 'FAB007' },
  { code: 'SKU002', name: 'Футболка Classic man', normMeters: 0.8, fabric: 'FAB005' },
  { code: 'SKU003', name: 'Футболка Regular', normMeters: 0.8, fabric: 'FAB013' },
  { code: 'SKU004', name: 'Футболка Free Fit', normMeters: 0.9, fabric: 'FAB010' },
  { code: 'SKU005', name: 'Футболка Oversize', normMeters: 1.0, fabric: 'FAB008' },
  { code: 'SKU006', name: 'Футболка OversizeCrop', normMeters: 1.0, fabric: 'FAB009' },
  { code: 'SKU007', name: 'Лонгслив Classic woman', normMeters: 0.8, fabric: 'FAB004' },
  { code: 'SKU008', name: 'Лонгслив Regular', normMeters: 1.3, fabric: 'FAB005' },
  { code: 'SKU009', name: 'Лонгслив Free Fit', normMeters: 1.3, fabric: 'FAB009' },
  { code: 'SKU010', name: 'Лонгслив Oversize', normMeters: 1.4, fabric: 'FAB013' },
  { code: 'SKU011', name: 'Свитшот Classic', normMeters: 1.3, fabric: 'FAB014' },
  { code: 'SKU012', name: 'Свитшот Regular', normMeters: 1.3, fabric: 'FAB014' },
  { code: 'SKU013', name: 'Свитшот Free Fit', normMeters: 1.3, fabric: 'FAB014' },
  { code: 'SKU015', name: 'Худи Classic', normMeters: 1.4, fabric: 'FAB014' },
  { code: 'SKU016', name: 'Худи Regular', normMeters: 1.4, fabric: 'FAB015' },
  { code: 'SKU017', name: 'Худи Free Fit', normMeters: 1.4, fabric: 'FAB015' },
  { code: 'SKU018', name: 'Худи Oversize', normMeters: 1.5, fabric: 'FAB016' },
  { code: 'SKU019', name: 'Худи Reglan', normMeters: 1.5, fabric: 'FAB014' },
  { code: 'SKU024', name: 'Свитшот халф зип Regular', normMeters: 1.2, fabric: 'FAB016' },
  { code: 'SKU025', name: 'Свитшот халф зип Free Fit', normMeters: 1.2, fabric: 'FAB014' },
  { code: 'SKU026', name: 'Свитшот халф зип Oversize', normMeters: 1.3, fabric: 'FAB014' },
  { code: 'SKU027', name: 'Свитшот халф зип Regular без пояса', normMeters: 1.2, fabric: 'FAB014' },
  { code: 'SKU028', name: 'Свитшот халф зип Free Fit без пояса', normMeters: 1.3, fabric: 'FAB014' },
  { code: 'SKU029', name: 'Свитшот халф зип Oversize без пояса', normMeters: 1.4, fabric: 'FAB014' },
  { code: 'SKU030', name: 'Олимпийка Free Fit', normMeters: 1.2, fabric: 'FAB014' },
  { code: 'SKU031', name: 'Зип худи Regular', normMeters: 1.3, fabric: 'FAB014' },
  { code: 'SKU032', name: 'Зип худи Free Fit', normMeters: 1.4, fabric: 'FAB015' },
  { code: 'SKU033', name: 'Зип худи Oversize', normMeters: 1.4, fabric: 'FAB015' },
  { code: 'SKU034', name: 'Зип худи Regular капюшон-стойка', normMeters: 1.4, fabric: 'FAB016' },
  { code: 'SKU035', name: 'Зип худи Free Fit капюшон-стойка', normMeters: 1.4, fabric: 'FAB014' },
  { code: 'SKU036', name: 'Зип худи Oversize капюшон-стойка', normMeters: 1.4, fabric: 'FAB014' },
  { code: 'SKU037', name: 'Брюки woman Regular', normMeters: 1.2, fabric: 'FAB015' },
  { code: 'SKU038', name: 'Брюки woman Regular отрезной пояс', normMeters: 1.3, fabric: 'FAB014' },
  { code: 'SKU039', name: 'Брюки man Regular', normMeters: 1.2, fabric: 'FAB014' },
  { code: 'SKU040', name: 'Брюки man Regular отрезной пояс', normMeters: 1.3, fabric: 'FAB014' },
  { code: 'SKU041', name: 'Брюки man Free Fit', normMeters: 1.3, fabric: 'FAB014' },
  { code: 'SKU042', name: 'Брюки man Free Fit отрезной пояс', normMeters: 1.3, fabric: 'FAB016' },
  { code: 'SKU043', name: 'Бомбер basic на кнопках', normMeters: 1.3, fabric: 'FAB020' },
  { code: 'SKU044', name: 'Бомбер-zipped на молнии', normMeters: 1.3, fabric: 'FAB014' },
  { code: 'SKU045', name: 'Шорты woman', normMeters: 0.9, fabric: 'FAB014' },
  { code: 'SKU046', name: 'Шорты man', normMeters: 1.0, fabric: 'FAB014' },
]

const SIZE_COEFFICIENTS = { XS: 0.85, S: 0.92, M: 1.0, L: 1.09, XL: 1.18, XXL: 1.28 }
const LOSS_CUT = 0.05
const LOSS_SEW = 0.02

// Category inferred from the SKU name (first word / known kind).
function inferCategory(name: string): string {
  const kinds = [
    'Футболка',
    'Лонгслив',
    'Свитшот',
    'Худи',
    'Брюки',
    'Бомбер',
    'Шорты',
    'Олимпийка',
  ]
  const lower = name.toLowerCase()
  for (const kind of kinds) {
    // case-insensitive: "Зип худи ..." -> "Худи", "Свитшот халф зип ..." -> "Свитшот"
    if (lower.includes(kind.toLowerCase())) return kind
  }
  throw new Error(`Cannot infer category from SKU name: ${name}`)
}

// Fit inferred from the SKU name when present.
function inferFit(name: string): string | null {
  const fits = ['Classic woman', 'Classic man', 'Classic', 'Regular', 'Free Fit', 'Oversize', 'Reglan']
  for (const fit of fits) {
    if (name.includes(fit)) return fit
  }
  return null
}

// norm_kg = norm_m × (widthCm / 100) × (densityGsm / 1000)
function metersToKg(normMeters: number, widthCm: number, densityGsm: number): number {
  return normMeters * (widthCm / 100) * (densityGsm / 1000)
}

async function main() {
  // 1) Suppliers — upsert by unique code.
  const supplierIdByCode = new Map<string, string>()
  for (const s of SUPPLIERS) {
    const row = await prisma.supplier.upsert({
      where: { code: s.code },
      update: { name: s.name, country: s.country },
      create: { code: s.code, name: s.name, country: s.country },
    })
    supplierIdByCode.set(s.code, row.id)
  }

  // 2) Fabrics — upsert by unique code, with per-category defaults.
  const fabricIdByCode = new Map<string, string>()
  const fabricByCode = new Map<string, (typeof FABRICS)[number] & { widthCm: number; preShrink: number }>()
  for (const f of FABRICS) {
    const { widthCm, preShrink } = categoryDefaults(f.category)
    const data = {
      name: f.name,
      category: f.category,
      composition: f.composition,
      canonicalUnit: CANONICAL_UNIT,
      densityGsm: f.densityGsm,
      widthCm,
      isDefaultWidth: true,
      preShrink,
      isDefaultShrink: true,
      rollSize: ROLL_SIZE,
      rollUnit: ROLL_UNIT,
    }
    const row = await prisma.fabric.upsert({
      where: { code: f.code },
      update: data,
      create: { code: f.code, ...data },
    })
    fabricIdByCode.set(f.code, row.id)
    fabricByCode.set(f.code, { ...f, widthCm, preShrink })
  }

  // 3) SupplierFabric edges — upsert by composite (supplierId, fabricId).
  let edgeCount = 0
  for (const e of EDGES) {
    const supplierId = supplierIdByCode.get(e.supplier)
    const fabricId = fabricIdByCode.get(e.fabric)
    if (!supplierId) throw new Error(`Unknown supplier ${e.supplier}`)
    if (!fabricId) throw new Error(`Unknown fabric ${e.fabric}`)
    await prisma.supplierFabric.upsert({
      where: { supplierId_fabricId: { supplierId, fabricId } },
      update: { priceRub: e.priceRub, priceUsd: e.priceUsd, priceUnit: 'kg' },
      create: { supplierId, fabricId, priceRub: e.priceRub, priceUsd: e.priceUsd, priceUnit: 'kg' },
    })
    edgeCount += 1
  }

  // 4) SKUs + passports + components.
  let passportCount = 0
  let componentCount = 0
  for (const sku of SKUS) {
    const fabric = fabricByCode.get(sku.fabric)
    if (!fabric) throw new Error(`SKU ${sku.code} maps to unknown fabric ${sku.fabric}`)
    const fabricId = fabricIdByCode.get(sku.fabric)!

    const category = inferCategory(sku.name)
    const fit = inferFit(sku.name)

    // 4a) SKU — upsert by unique code.
    const skuRow = await prisma.sku.upsert({
      where: { code: sku.code },
      update: { name: sku.name, category, fit },
      create: { code: sku.code, name: sku.name, category, fit },
    })

    // 4b) ProductPassport — upsert by unique skuId.
    const passport = await prisma.productPassport.upsert({
      where: { skuId: skuRow.id },
      update: { baseSize: 'M', sizeCoefficients: SIZE_COEFFICIENTS, version: 1 },
      create: { skuId: skuRow.id, baseSize: 'M', sizeCoefficients: SIZE_COEFFICIENTS, version: 1 },
    })
    passportCount += 1

    // 4c) Rebuild components idempotently: drop existing, create one MAIN.
    await prisma.passportComponent.deleteMany({ where: { passportId: passport.id } })

    const normKg = metersToKg(sku.normMeters, fabric.widthCm, fabric.densityGsm)
    const component = await prisma.passportComponent.create({
      data: {
        passportId: passport.id,
        role: 'MAIN',
        normBase: normKg,
        normBaseMeters: sku.normMeters,
        lossCut: LOSS_CUT,
        lossSew: LOSS_SEW,
      },
    })
    componentCount += 1

    // 4d) Allowed fabric for the MAIN component = mapped fabric.
    await prisma.componentAllowedFabric.create({
      data: { componentId: component.id, fabricId },
    })
  }

  // 5) Summary.
  console.log('Seed complete:')
  console.log(`  suppliers:  ${supplierIdByCode.size}`)
  console.log(`  fabrics:    ${fabricIdByCode.size}`)
  console.log(`  edges:      ${edgeCount}`)
  console.log(`  skus:       ${SKUS.length}`)
  console.log(`  passports:  ${passportCount}`)
  console.log(`  components: ${componentCount}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
