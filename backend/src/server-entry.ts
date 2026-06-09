import { getRequestListener } from '@hono/node-server'

import { createApp } from './app'
import { createBackendRuntime } from './runtime'

// Vercel Node serverless entry. getRequestListener bridges the Hono web app to
// the Node (req, res) handler signature Vercel expects. This module is bundled
// into a single self-contained file at build time (see backend/vercel.json) so
// there is no runtime module resolution on Vercel.
const runtime = createBackendRuntime()
const app = createApp({ env: runtime.env, prisma: runtime.prisma })

export default getRequestListener(app.fetch)
