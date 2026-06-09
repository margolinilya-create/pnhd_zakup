import bcrypt from 'bcryptjs'

// Portable password hashing (bcrypt) so the backend runs on any JS runtime,
// including Vercel's Node functions. (Bun.password/argon2 is Bun-only.)
const SALT_ROUNDS = 12

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}
