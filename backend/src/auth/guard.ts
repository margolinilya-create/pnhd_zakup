import type { MiddlewareHandler } from 'hono'

import type { UserDto } from '@web-app-demo/contracts'

import type { AuthService } from './service'

export type AuthedVariables = {
  authService: AuthService
  userId: string
  authUser: UserDto
}

// Middleware that requires a valid access token. Reuses AuthService.getMe, which
// verifies the JWT and checks the active DB session, throwing AppError(401) otherwise.
export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const authService = c.get('authService') as AuthService
    const authorization = c.req.header('authorization')
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined
    const { user } = await authService.getMe(token)
    c.set('userId', user.id)
    c.set('authUser', user)
    await next()
  }
}
