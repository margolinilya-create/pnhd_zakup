import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../app'
import { createPrisma, type DbClient } from '../db'
import { loadEnv } from '../env'

const databaseUrl = process.env.TEST_DATABASE_URL
const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('procurement API integration', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl!,
    TEST_DATABASE_URL: databaseUrl!,
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
    CORS_ORIGINS: 'http://localhost:5173',
    COOKIE_SECURE: 'false',
  })
  const prisma: DbClient = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma })

  let supplierId = ''
  let footerId = ''
  let ribanaId = ''
  let skuId = ''
  let mainComponentId = ''
  let ribComponentId = ''
  let accessToken = ''

  async function resetDb() {
    await prisma.actualFact.deleteMany()
    await prisma.order.deleteMany()
    await prisma.componentAllowedFabric.deleteMany()
    await prisma.passportComponent.deleteMany()
    await prisma.productPassport.deleteMany()
    await prisma.supplierFabric.deleteMany()
    await prisma.sku.deleteMany()
    await prisma.fabric.deleteMany()
    await prisma.supplier.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  }

  async function seedGolden() {
    const supplier = await prisma.supplier.create({ data: { code: 'S1', name: 'Поставщик', country: 'RU' } })
    const footer = await prisma.fabric.create({
      data: { code: 'FOOT', name: 'Футер', category: 'Футер', canonicalUnit: 'kg', densityGsm: 320, widthCm: 180, preShrink: 0.06, rollSize: 25, rollUnit: 'kg' },
    })
    const ribana = await prisma.fabric.create({
      data: { code: 'RIB', name: 'Рибана', category: 'Рибана', canonicalUnit: 'kg', densityGsm: 220, widthCm: 90, preShrink: 0.05, rollSize: 25, rollUnit: 'kg' },
    })
    await prisma.supplierFabric.create({ data: { supplierId: supplier.id, fabricId: footer.id, priceRub: 580, priceUsd: 6.3, priceUnit: 'kg' } })
    await prisma.supplierFabric.create({ data: { supplierId: supplier.id, fabricId: ribana.id, priceRub: 517, priceUsd: 5.6, priceUnit: 'kg' } })
    const sku = await prisma.sku.create({ data: { code: 'SKU_H', name: 'Худи', category: 'Худи' } })
    const passport = await prisma.productPassport.create({
      data: { skuId: sku.id, baseSize: 'M', version: 1, sizeCoefficients: { XS: 0.85, S: 0.92, M: 1.0, L: 1.09, XL: 1.18, XXL: 1.28 } },
    })
    const main = await prisma.passportComponent.create({ data: { passportId: passport.id, role: 'MAIN', normBase: 0.65, lossCut: 0.05, lossSew: 0.02 } })
    const rib = await prisma.passportComponent.create({ data: { passportId: passport.id, role: 'RIB', normBase: 0.08, lossCut: 0.05, lossSew: 0.03 } })
    await prisma.componentAllowedFabric.create({ data: { componentId: main.id, fabricId: footer.id } })
    await prisma.componentAllowedFabric.create({ data: { componentId: rib.id, fabricId: ribana.id } })

    supplierId = supplier.id
    footerId = footer.id
    ribanaId = ribana.id
    skuId = sku.id
    mainComponentId = main.id
    ribComponentId = rib.id
  }

  function calcBody() {
    return {
      skuId,
      sizeBreakdown: { M: 40, L: 30, XL: 20 },
      componentSelections: [
        { componentId: mainComponentId, fabricId: footerId, supplierId },
        { componentId: ribComponentId, fabricId: ribanaId, supplierId },
      ],
      reservePct: 0.05,
      currency: 'RUB',
      fxRate: 1,
    }
  }

  beforeEach(async () => {
    await resetDb()
    await seedGolden()
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'buyer@example.com', password: 'password123' }),
    })
    const body = (await res.json()) as { accessToken: string }
    accessToken = body.accessToken
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  function authed(path: string, init: RequestInit = {}) {
    return app.request(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
    })
  }

  test('reference reads are public (auth disabled for the open demo)', async () => {
    const res = await app.request('/api/skus')
    expect(res.status).toBe(200)
  })

  test('lists seeded SKUs with passport components', async () => {
    const res = await authed('/api/skus')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { skus: Array<{ id: string; passport: { components: unknown[] } | null }> }
    const sku = body.skus.find((s) => s.id === skuId)!
    expect(sku.passport?.components).toHaveLength(2)
  })

  test('POST /api/calc computes the golden case (56 425 ₽)', async () => {
    const res = await authed('/api/calc', { method: 'POST', body: JSON.stringify(calcBody()) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { totalCostRub: number; fabrics: Array<{ fabricId: string; orderQty: number }> } }
    expect(body.result.totalCostRub).toBe(56425)
    expect(body.result.fabrics.find((f) => f.fabricId === footerId)!.orderQty).toBe(75)
  })

  test('orders are immutable: changing a fabric price after save does not change the stored result', async () => {
    const created = await authed('/api/orders', { method: 'POST', body: JSON.stringify({ ...calcBody(), mode: 'ORDER' }) })
    expect(created.status).toBe(201)
    const { order } = (await created.json()) as { order: { id: string; result: { totalCostRub: number } } }
    expect(order.result.totalCostRub).toBe(56425)

    // Mutate reference data after the order is saved.
    await prisma.supplierFabric.updateMany({ where: { fabricId: footerId }, data: { priceRub: 9999 } })

    const fetched = await authed(`/api/orders/${order.id}`)
    const refetched = (await fetched.json()) as { order: { result: { totalCostRub: number } } }
    expect(refetched.order.result.totalCostRub).toBe(56425)
  })

  test('fact entry returns plan/fact deviation per fabric', async () => {
    const created = await authed('/api/orders', { method: 'POST', body: JSON.stringify({ ...calcBody(), mode: 'ORDER' }) })
    const { order } = (await created.json()) as { order: { id: string } }

    const factRes = await authed(`/api/orders/${order.id}/fact`, {
      method: 'POST',
      body: JSON.stringify({ facts: [{ fabricId: footerId, actualConsumed: 80, producedQty: 90 }] }),
    })
    expect(factRes.status).toBe(201)
    const { order: withFact } = (await factRes.json()) as {
      order: { facts: Array<{ fabricId: string; plannedKg: number | null; deviation: number | null }> }
    }
    const fact = withFact.facts.find((f) => f.fabricId === footerId)!
    expect(fact.plannedKg).toBeCloseTo(70.995249, 4)
    expect(fact.deviation).toBeCloseTo(80 / 70.995249 - 1, 4)
  })

  test('rejects a fabric not allowed for the component', async () => {
    const res = await authed('/api/calc', {
      method: 'POST',
      body: JSON.stringify({
        ...calcBody(),
        componentSelections: [
          { componentId: mainComponentId, fabricId: ribanaId, supplierId }, // ribana not allowed for MAIN
          { componentId: ribComponentId, fabricId: ribanaId, supplierId },
        ],
      }),
    })
    expect(res.status).toBe(400)
  })

  test('fabric: create, update, soft-delete (drops from list)', async () => {
    const created = await authed('/api/fabrics', {
      method: 'POST',
      body: JSON.stringify({ code: 'FABX', name: 'Тест', category: 'Кулирка', canonicalUnit: 'kg', densityGsm: 200, widthCm: 180, preShrink: 0.05, rollSize: 25, rollUnit: 'kg' }),
    })
    expect(created.status).toBe(201)
    const { fabric } = (await created.json()) as { fabric: { id: string; code: string } }
    expect(fabric.code).toBe('FABX')

    const upd = await authed(`/api/fabrics/${fabric.id}`, { method: 'PUT', body: JSON.stringify({ name: 'Тест 2' }) })
    expect(upd.status).toBe(200)
    expect(((await upd.json()) as { fabric: { name: string } }).fabric.name).toBe('Тест 2')

    const del = await authed(`/api/fabrics/${fabric.id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)
    const list = (await (await authed('/api/fabrics')).json()) as { fabrics: Array<{ id: string }> }
    expect(list.fabrics.some((f) => f.id === fabric.id)).toBe(false)
  })

  test('duplicate fabric code returns 409', async () => {
    const body = JSON.stringify({ code: 'DUP', name: 'A', category: 'X', densityGsm: 200, widthCm: 180, preShrink: 0.05, rollSize: 25 })
    expect((await authed('/api/fabrics', { method: 'POST', body })).status).toBe(201)
    expect((await authed('/api/fabrics', { method: 'POST', body })).status).toBe(409)
  })

  test('create SKU + upsert passport with a component', async () => {
    const skuRes = await authed('/api/skus', { method: 'POST', body: JSON.stringify({ code: 'SKUX', name: 'Новое', category: 'Худи' }) })
    expect(skuRes.status).toBe(201)
    const { sku } = (await skuRes.json()) as { sku: { id: string } }
    const pRes = await authed(`/api/skus/${sku.id}/passport`, {
      method: 'PUT',
      body: JSON.stringify({ baseSize: 'M', sizeCoefficients: { M: 1.0, L: 1.09 }, components: [{ role: 'MAIN', normBase: 0.7, lossCut: 0.05, lossSew: 0.02, allowedFabricIds: [footerId] }] }),
    })
    expect(pRes.status).toBe(200)
    const updated = (await pRes.json()) as { sku: { passport: { components: Array<{ allowedFabricIds: string[] }> } | null } }
    expect(updated.sku.passport?.components).toHaveLength(1)
    expect(updated.sku.passport?.components[0].allowedFabricIds).toContain(footerId)
  })

  test('upsert supplier-fabric price edge', async () => {
    const sup = (await (await authed('/api/suppliers', { method: 'POST', body: JSON.stringify({ code: 'SUPX', name: 'Новый', country: 'RU' }) })).json()) as { supplier: { id: string } }
    const edge = await authed('/api/supplier-fabrics', { method: 'POST', body: JSON.stringify({ supplierId: sup.supplier.id, fabricId: footerId, priceRub: 500, priceUnit: 'kg' }) })
    expect(edge.status).toBe(201)
    expect(((await edge.json()) as { supplierFabric: { priceRub: number } }).supplierFabric.priceRub).toBe(500)
  })

  // --- Phase 6 review fixes ---

  test('order rejects a soft-deleted fabric (snapshot filters status=active)', async () => {
    await authed(`/api/fabrics/${footerId}`, { method: 'DELETE' })
    const res = await authed('/api/orders', { method: 'POST', body: JSON.stringify({ ...calcBody(), mode: 'ORDER' }) })
    expect(res.status).toBe(400)
  })

  test('upsertPassport is atomic: a bad allowed-fabric id rolls back, leaving the prior passport intact', async () => {
    const { sku } = (await (await authed('/api/skus', { method: 'POST', body: JSON.stringify({ code: 'SKUTX', name: 'Tx', category: 'Худи' }) })).json()) as { sku: { id: string } }
    await authed(`/api/skus/${sku.id}/passport`, {
      method: 'PUT',
      body: JSON.stringify({ baseSize: 'M', sizeCoefficients: { M: 1 }, components: [{ role: 'MAIN', normBase: 0.5, lossCut: 0.05, lossSew: 0.02, allowedFabricIds: [footerId] }] }),
    })
    const bad = await authed(`/api/skus/${sku.id}/passport`, {
      method: 'PUT',
      body: JSON.stringify({ baseSize: 'M', sizeCoefficients: { M: 1, L: 1.1 }, components: [{ role: 'MAIN', normBase: 0.9, lossCut: 0.05, lossSew: 0.02, allowedFabricIds: ['00000000-0000-0000-0000-000000000000'] }] }),
    })
    expect(bad.status).toBeGreaterThanOrEqual(400)
    const after = (await (await authed('/api/skus')).json()) as { skus: Array<{ id: string; passport: { components: Array<{ normBase: number; allowedFabricIds: string[] }> } | null }> }
    const skuAfter = after.skus.find((s) => s.id === sku.id)!
    expect(skuAfter.passport?.components).toHaveLength(1)
    expect(skuAfter.passport?.components[0].normBase).toBe(0.5) // unchanged v1, not the failed v2 (0.9)
    expect(skuAfter.passport?.components[0].allowedFabricIds).toEqual([footerId])
  })

  test("deviation for an 'm'-canonical fabric uses the meters plan, not kg", async () => {
    const { fabric } = (await (await authed('/api/fabrics', { method: 'POST', body: JSON.stringify({ code: 'MFAB', name: 'Метровая', category: 'X', canonicalUnit: 'm', densityGsm: 200, widthCm: 150, preShrink: 0, rollSize: 50, rollUnit: 'm' }) })).json()) as { fabric: { id: string } }
    await authed('/api/supplier-fabrics', { method: 'POST', body: JSON.stringify({ supplierId, fabricId: fabric.id, priceRub: 100, priceUnit: 'm' }) })
    const { sku } = (await (await authed('/api/skus', { method: 'POST', body: JSON.stringify({ code: 'MSKU', name: 'M', category: 'X' }) })).json()) as { sku: { id: string } }
    const built = (await (await authed(`/api/skus/${sku.id}/passport`, { method: 'PUT', body: JSON.stringify({ baseSize: 'M', sizeCoefficients: { M: 1 }, components: [{ role: 'MAIN', normBase: 1.0, lossCut: 0, lossSew: 0, allowedFabricIds: [fabric.id] }] }) })).json()) as { sku: { passport: { components: Array<{ id: string }> } } }
    const componentId = built.sku.passport.components[0].id
    const { order } = (await (await authed('/api/orders', { method: 'POST', body: JSON.stringify({ skuId: sku.id, sizeBreakdown: { M: 10 }, componentSelections: [{ componentId, fabricId: fabric.id, supplierId }], reservePct: 0, currency: 'RUB', fxRate: 1, mode: 'ORDER' }) })).json()) as { order: { id: string; result: { fabrics: Array<{ fabricId: string; needM: number }> } } }
    const needM = order.result.fabrics.find((f) => f.fabricId === fabric.id)!.needM
    const factRes = (await (await authed(`/api/orders/${order.id}/fact`, { method: 'POST', body: JSON.stringify({ facts: [{ fabricId: fabric.id, actualConsumed: needM * 1.1, producedQty: 10 }] }) })).json()) as { order: { facts: Array<{ fabricId: string; deviation: number | null }> } }
    const fact = factRes.order.facts.find((f) => f.fabricId === fabric.id)!
    expect(fact.deviation).toBeCloseTo(0.1, 5) // 10% over the meters plan
  })

  test('facts array over the cap is rejected (400)', async () => {
    const { order } = (await (await authed('/api/orders', { method: 'POST', body: JSON.stringify({ ...calcBody(), mode: 'ORDER' }) })).json()) as { order: { id: string } }
    const facts = Array.from({ length: 501 }, () => ({ fabricId: footerId, actualConsumed: 1, producedQty: 1 }))
    const res = await authed(`/api/orders/${order.id}/fact`, { method: 'POST', body: JSON.stringify({ facts }) })
    expect(res.status).toBe(400)
  })
})
