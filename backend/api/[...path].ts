import type { Hono } from 'hono'

// Lazy init so a module-resolution/init failure is caught and surfaced in the
// response instead of an opaque FUNCTION_INVOCATION_FAILED.
let appPromise: Promise<Hono> | null = null

async function getApp(): Promise<Hono> {
  if (!appPromise) {
    appPromise = (async () => {
      const { createApp } = await import('../src/app')
      const { createBackendRuntime } = await import('../src/runtime')
      const runtime = createBackendRuntime()
      return createApp({ env: runtime.env, prisma: runtime.prisma }) as unknown as Hono
    })()
  }
  return appPromise
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const app = await getApp()
    return await app.fetch(req)
  } catch (error) {
    appPromise = null
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
    return new Response(`INIT_ERROR: ${message}`, { status: 500, headers: { 'content-type': 'text/plain' } })
  }
}
