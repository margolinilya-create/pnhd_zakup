import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { RootLayout } from './pages'
import { CalculatorPage, OrderDetailPage, OrdersPage } from './procurement-pages'

const rootRoute = createRootRoute({
  component: RootLayout,
})

// Auth disabled for the open demo — the calculator is the landing page.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: CalculatorPage,
})

const ordersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders',
  component: OrdersPage,
})

const orderDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders/$id',
  component: OrderDetailPage,
})

const routeTree = rootRoute.addChildren([indexRoute, ordersRoute, orderDetailRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
