// @ts-nocheck
// Single Vercel serverless function. vercel.json rewrites every /api/* request here,
// and the bundled Hono app (built at deploy time, see buildCommand) routes the
// original path internally. The bundle's default export is a Node (req, res) listener.
import handler from '../src/_server-bundle.mjs'

export default handler
