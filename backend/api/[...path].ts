// @ts-nocheck
// Vercel serverless function (catch-all for /api/*). The real app is bundled into
// a single self-contained file at deploy time by `bun build` (see backend/vercel.json
// buildCommand) so Vercel does not have to resolve the multi-file TS + generated
// Prisma client graph. The bundle's default export is a Node (req, res) listener.
import handler from '../src/_server-bundle.mjs'

export default handler
