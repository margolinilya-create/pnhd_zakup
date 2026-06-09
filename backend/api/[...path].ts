import { handle } from 'hono/vercel'

import { createApp } from '../src/app'
import { createBackendRuntime } from '../src/runtime'

// Vercel Node serverless function. Catches every /api/* route and hands it to the
// Hono app. Prisma uses the pg driver adapter (no engine binary) + the Supabase
// transaction pooler, which suits short-lived serverless connections.
const runtime = createBackendRuntime()
const app = createApp({ env: runtime.env, prisma: runtime.prisma })

export default handle(app)
