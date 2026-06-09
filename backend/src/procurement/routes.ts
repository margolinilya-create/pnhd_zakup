import {
  addFactRequestSchema,
  calcRequestSchema,
  createOrderRequestSchema,
  fabricInputSchema,
  fabricUpdateSchema,
  passportInputSchema,
  skuInputSchema,
  skuUpdateSchema,
  supplierFabricInputSchema,
  supplierFabricUpdateSchema,
  supplierInputSchema,
  supplierUpdateSchema,
} from '@web-app-demo/contracts'
import { Hono } from 'hono'

import type { AppEnv } from '../env'
import type { ProcurementService } from './service'

type ProcurementEnv = {
  Variables: {
    procurementService: ProcurementService
    env: AppEnv
  }
}

export function createProcurementRoutes() {
  const routes = new Hono<ProcurementEnv>()

  // NOTE: authentication intentionally disabled for the open demo — these
  // endpoints are public. Re-add requireAuth() before any real production use.

  // --- Reference reads ---
  routes.get('/fabrics', async (c) => c.json({ fabrics: await c.get('procurementService').listFabrics() }))
  routes.get('/suppliers', async (c) => c.json({ suppliers: await c.get('procurementService').listSuppliers() }))
  routes.get('/supplier-fabrics', async (c) =>
    c.json({ supplierFabrics: await c.get('procurementService').listSupplierFabrics() }),
  )
  routes.get('/skus', async (c) => c.json({ skus: await c.get('procurementService').listSkus() }))

  // --- Calculation (no persistence) ---
  routes.post('/calc', async (c) => {
    const input = calcRequestSchema.parse(await c.req.json())
    const result = await c.get('procurementService').calc(input)
    return c.json({ result })
  })

  // --- Orders (immutable: store input snapshot + result; no update endpoint) ---
  routes.post('/orders', async (c) => {
    const { mode, ...input } = createOrderRequestSchema.parse(await c.req.json())
    const order = await c.get('procurementService').createOrder(input, mode)
    return c.json({ order }, 201)
  })

  routes.get('/orders', async (c) => c.json({ orders: await c.get('procurementService').listOrders() }))

  routes.get('/orders/:id', async (c) =>
    c.json({ order: await c.get('procurementService').getOrder(c.req.param('id')) }),
  )

  // --- Facts (append-only; never recomputes the saved order) ---
  routes.post('/orders/:id/fact', async (c) => {
    const body = addFactRequestSchema.parse(await c.req.json())
    const order = await c.get('procurementService').addFacts(c.req.param('id'), body.facts)
    return c.json({ order }, 201)
  })

  // --- Reference writes (admin; soft-delete) ---
  routes.post('/fabrics', async (c) => {
    const fabric = await c.get('procurementService').createFabric(fabricInputSchema.parse(await c.req.json()))
    return c.json({ fabric }, 201)
  })
  routes.put('/fabrics/:id', async (c) => {
    const fabric = await c.get('procurementService').updateFabric(c.req.param('id'), fabricUpdateSchema.parse(await c.req.json()))
    return c.json({ fabric })
  })
  routes.delete('/fabrics/:id', async (c) => {
    await c.get('procurementService').deleteFabric(c.req.param('id'))
    return c.body(null, 204)
  })

  routes.post('/suppliers', async (c) => {
    const supplier = await c.get('procurementService').createSupplier(supplierInputSchema.parse(await c.req.json()))
    return c.json({ supplier }, 201)
  })
  routes.put('/suppliers/:id', async (c) => {
    const supplier = await c.get('procurementService').updateSupplier(c.req.param('id'), supplierUpdateSchema.parse(await c.req.json()))
    return c.json({ supplier })
  })
  routes.delete('/suppliers/:id', async (c) => {
    await c.get('procurementService').deleteSupplier(c.req.param('id'))
    return c.body(null, 204)
  })

  routes.post('/supplier-fabrics', async (c) => {
    const supplierFabric = await c.get('procurementService').upsertSupplierFabric(supplierFabricInputSchema.parse(await c.req.json()))
    return c.json({ supplierFabric }, 201)
  })
  routes.put('/supplier-fabrics/:id', async (c) => {
    const supplierFabric = await c.get('procurementService').updateSupplierFabric(c.req.param('id'), supplierFabricUpdateSchema.parse(await c.req.json()))
    return c.json({ supplierFabric })
  })
  routes.delete('/supplier-fabrics/:id', async (c) => {
    await c.get('procurementService').deleteSupplierFabric(c.req.param('id'))
    return c.body(null, 204)
  })

  routes.post('/skus', async (c) => {
    const sku = await c.get('procurementService').createSku(skuInputSchema.parse(await c.req.json()))
    return c.json({ sku }, 201)
  })
  routes.put('/skus/:id', async (c) => {
    const sku = await c.get('procurementService').updateSku(c.req.param('id'), skuUpdateSchema.parse(await c.req.json()))
    return c.json({ sku })
  })
  routes.delete('/skus/:id', async (c) => {
    await c.get('procurementService').deleteSku(c.req.param('id'))
    return c.body(null, 204)
  })
  routes.put('/skus/:id/passport', async (c) => {
    const sku = await c.get('procurementService').upsertPassport(c.req.param('id'), passportInputSchema.parse(await c.req.json()))
    return c.json({ sku })
  })

  return routes
}
