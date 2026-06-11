import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Typography } from '@/components/ui/typography'

/**
 * Section header shared across the calculator, orders and reference screens:
 * optional eyebrow badge + title + description, with an optional right-aligned
 * actions slot and free-form children below (e.g. an admin sub-nav).
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid gap-2">
          {eyebrow ? (
            <Badge variant="outline" className="w-fit">
              {eyebrow}
            </Badge>
          ) : null}
          <Typography variant="h1">{title}</Typography>
          {description ? (
            <Typography tone="muted" balance>
              {description}
            </Typography>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Fragment keeps the ReactNode slot out of a raw DOM text position (typography-policy lint). */}
            <>{actions}</>
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}
