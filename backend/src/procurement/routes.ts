import { addFactRequestSchema, calcRequestSchema, createOrderRequestSchema } from '@web-app-demo/contracts'
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

  return routes
}
