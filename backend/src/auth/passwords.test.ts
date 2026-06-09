import { describe, expect, test } from 'bun:test'

import { hashPassword, verifyPassword } from './passwords'

describe('passwords', () => {
  test('hashes with bcrypt and verifies without storing plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple')

    // bcrypt hashes start with $2a$/$2b$/$2y$ — portable across JS runtimes (incl. Vercel Node)
    expect(/^\$2[aby]\$/.test(hash)).toBe(true)
    expect(hash).not.toContain('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(await verifyPassword('wrong password', hash)).toBe(false)
  })
})
