import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from './generated/prisma/client'

export function createPrisma(connectionString: string) {
  const normalized = normalizePgConnectionString(connectionString)
  // The driver adapter ignores the `?schema=` URL param at runtime (only the
  // migration engine honors it), so we read it here and pass it explicitly.
  // Without this, queries hit the default `public` search_path — which would
  // leak test data into the app schema when TEST_DATABASE_URL uses app_test.
  const schema = new URL(normalized).searchParams.get('schema') ?? undefined
  const adapter = new PrismaPg({ connectionString: normalized }, schema ? { schema } : undefined)
  return new PrismaClient({ adapter })
}

export type DbClient = ReturnType<typeof createPrisma>

export function normalizePgConnectionString(connectionString: string) {
  const url = new URL(connectionString)
  const sslMode = url.searchParams.get('sslmode')
  const useLibpqCompat = url.searchParams.get('uselibpqcompat')

  if (sslMode === 'require' && useLibpqCompat === null) {
    url.searchParams.set('uselibpqcompat', 'true')
  }

  return url.toString()
}
