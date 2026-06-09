import { Link, Outlet } from '@tanstack/react-router'

import { buttonVariants } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'

const navLinkClass = cn(
  buttonVariants({ variant: 'ghost', size: 'sm' }),
  'text-muted-foreground data-[status=active]:bg-secondary data-[status=active]:text-secondary-foreground data-[status=active]:hover:bg-secondary/80 data-[status=active]:hover:text-secondary-foreground'
)

export function RootLayout() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
          <Typography asChild variant="h6">
            <Link to="/">Закупщик · калькулятор</Link>
          </Typography>
          <nav className="ml-auto flex items-center gap-2" aria-label="Primary">
            <Typography asChild variant="control" tone="muted">
              <Link to="/" className={navLinkClass}>
                Калькулятор
              </Link>
            </Typography>
            <Typography asChild variant="control" tone="muted">
              <Link to="/orders" className={navLinkClass}>
                Заказы
              </Link>
            </Typography>
          </nav>
        </div>
      </header>
      <Outlet />
    </main>
  )
}
