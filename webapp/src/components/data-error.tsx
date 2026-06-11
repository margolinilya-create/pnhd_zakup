import { Alert01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ApiRequestError } from '@/lib/api'

function message(error: unknown): string {
  if (error instanceof ApiRequestError) {
    // The hand-rolled fetch client surfaces network/CORS failures as a generic
    // "Failed to fetch"; translate that into something a non-technical user can act on.
    if (error.status === 0 || /failed to fetch/i.test(error.message)) {
      return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
    }
    return error.message
  }
  if (error instanceof Error) {
    if (/failed to fetch/i.test(error.message)) {
      return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
    }
    return error.message
  }
  return 'Неизвестная ошибка'
}

/**
 * Shared error state for data queries. Replaces the previous silent-failure
 * behaviour where a failed list/detail query left a stuck skeleton or a blank
 * list with no explanation (the "каталог не загружается" report). Always offers
 * a retry so a transient network/cold-start hiccup is one click to recover.
 */
export function DataError({
  error,
  onRetry,
  title = 'Не удалось загрузить данные',
}: {
  error: unknown
  onRetry: () => void
  title?: string
}) {
  return (
    <Empty className="border-0 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{message(error)}</EmptyDescription>
      </EmptyHeader>
      <Button type="button" variant="outline" onClick={onRetry}>
        <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
        Повторить
      </Button>
    </Empty>
  )
}
