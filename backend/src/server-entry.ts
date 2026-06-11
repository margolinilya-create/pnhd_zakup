import type { IncomingMessage, ServerResponse } from 'node:http'

import { createApp } from './app'
import { createBackendRuntime } from './runtime'

// Vercel Node serverless entry, bundled into one self-contained file at build
// time (see backend/vercel.json).
//
// We hand-roll the (req, res) -> Hono bridge instead of using
// `@hono/node-server`'s getRequestListener: on Vercel's current Node runtime its
// streaming request-body adapter never completes for non-GET requests, so every
// OPTIONS preflight / POST / PUT hung until the 30s function timeout
// (FUNCTION_INVOCATION_TIMEOUT → "Failed to fetch" in the browser). Buffering the
// body ourselves and passing a plain Web Request (no ReadableStream/duplex) sticks
// to standard APIs and avoids that hang.
const runtime = createBackendRuntime()
const app = createApp({ env: runtime.env, prisma: runtime.prisma })

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') return undefined
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return chunks.length ? Buffer.concat(chunks) : undefined
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const method = req.method ?? 'GET'
    const host = req.headers.host ?? 'localhost'
    const url = `https://${host}${req.url ?? '/'}`

    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) for (const v of value) headers.append(key, v)
      else if (value != null) headers.set(key, value)
    }

    const body = await readBody(req)
    // body is a Node Buffer (a Uint8Array at runtime, a valid BodyInit for undici's
    // Request); cast for the DOM-typed Request without changing the buffering behaviour.
    const request = new Request(url, { method, headers, body: body as BodyInit | undefined })
    const response = await app.fetch(request)

    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    const setCookies = response.headers.getSetCookie?.()
    if (setCookies && setCookies.length > 0) res.setHeader('set-cookie', setCookies)

    const arrayBuffer = await response.arrayBuffer()
    res.end(arrayBuffer.byteLength ? Buffer.from(arrayBuffer) : undefined)
  } catch (error) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'Internal error' } }))
  }
}
