import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { FabricsAdminPage, SkusAdminPage, SuppliersAdminPage } from './admin-pages'
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

const fabricsAdminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/fabrics',
  component: FabricsAdminPage,
})

const suppliersAdminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/suppliers',
  component: SuppliersAdminPage,
})

const skusAdminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin/skus',
  component: SkusAdminPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  ordersRoute,
  orderDetailRoute,
  fabricsAdminRoute,
  suppliersAdminRoute,
  skusAdminRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
