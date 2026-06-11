import { Calculator01Icon, Database02Icon, Invoice01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, Outlet } from '@tanstack/react-router'
import type { IconSvgElement } from '@hugeicons/react'

import { buttonVariants } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'

const navLinkClass = cn(
  buttonVariants({ variant: 'ghost', size: 'sm' }),
  'gap-1.5 text-muted-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary data-[status=active]:hover:bg-primary/15 data-[status=active]:hover:text-primary'
)

const navItems: { to: string; label: string; icon: IconSvgElement }[] = [
  { to: '/', label: 'Калькулятор', icon: Calculator01Icon },
  { to: '/orders', label: 'Заказы', icon: Invoice01Icon },
  { to: '/admin/fabrics', label: 'Справочники', icon: Database02Icon },
]

export function RootLayout() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <HugeiconsIcon icon={Calculator01Icon} strokeWidth={2} className="size-4" />
            </span>
            <Typography variant="h6" as="span">
              Закупщик · калькулятор
            </Typography>
          </Link>
          <nav className="ml-auto flex items-center gap-1.5" aria-label="Primary">
            {navItems.map((item) => (
              <Link key={item.to} to={item.to} className={navLinkClass}>
                <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                <Typography asChild variant="control" tone="current">
                  <span>{item.label}</span>
                </Typography>
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <Outlet />
    </main>
  )
}
