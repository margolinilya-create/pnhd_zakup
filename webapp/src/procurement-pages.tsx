import { ArrowDown01Icon, ArrowLeft01Icon, Calculator01Icon, Invoice01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import type { CalcRequest, CalcResult, FabricDto, SupplierFabricDto } from '@web-app-demo/contracts'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { DataError } from '@/components/data-error'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { ApiRequestError } from '@/lib/api'
import { fabricDensityLabel, fabricTypeKey, formatFabricLabel, groupFabricsByType } from '@/lib/fabric'
import { cheapestSupplierFor, pickSupplierFor, type SupplierPickMode } from '@/lib/supplier'
import { useAuth } from '@/lib/use-auth'

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL']
const RESERVE_OPTIONS = [0, 0.03, 0.05, 0.07, 0.1]
const DEFECT_OPTIONS = [0, 0.01, 0.02, 0.03, 0.05]

function fmt(value: number, digits = 2): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function money(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

function errMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Неизвестная ошибка'
}

const ROLE_LABELS: Record<string, string> = {
  MAIN: 'Основная ткань',
  RIB: 'Рибана',
  TRIM: 'Отделка',
  OTHER: 'Прочее',
}

// Authentication is intentionally disabled for the open demo — render directly.
function RequireAuth({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function PageSkeleton() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10">
      <div className="grid gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-80 max-w-full" />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </section>
  )
}

// ---------------- Calculator ----------------

type Selection = { fabricId: string; supplierId: string }

const CALC_STORAGE_KEY = 'pnhd-calc-state-v1'

type PersistedCalc = {
  skuId: string
  selections: Record<string, Selection>
  sizeQ: Record<string, number>
  reservePct: number
  defectPct: number
  currency: 'RUB' | 'USD'
  fxRate: number
  supplierMode: SupplierPickMode
}

function loadCalcState(): Partial<PersistedCalc> | null {
  try {
    const raw = localStorage.getItem(CALC_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<PersistedCalc>) : null
  } catch {
    return null
  }
}

function saveCalcState(state: PersistedCalc) {
  try {
    localStorage.setItem(CALC_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / unavailable storage
  }
}

function clearCalcState() {
  try {
    localStorage.removeItem(CALC_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function CalculatorPage() {
  return (
    <RequireAuth>
      <CalculatorInner />
    </RequireAuth>
  )
}

function CalculatorInner() {
  const { api } = useAuth()
  const navigate = useNavigate()

  const skusQuery = useQuery({ queryKey: ['skus'], queryFn: () => api.listSkus() })
  const fabricsQuery = useQuery({ queryKey: ['fabrics'], queryFn: () => api.listFabrics() })
  const sfQuery = useQuery({ queryKey: ['supplier-fabrics'], queryFn: () => api.listSupplierFabrics() })
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: () => api.listSuppliers() })

  const loaded = useMemo(() => loadCalcState(), [])
  const [skuId, setSkuId] = useState(loaded?.skuId ?? '')
  const [selections, setSelections] = useState<Record<string, Selection>>(loaded?.selections ?? {})
  const [sizeQ, setSizeQ] = useState<Record<string, number>>(loaded?.sizeQ ?? {})
  const [reservePct, setReservePct] = useState(loaded?.reservePct ?? 0.05)
  const [defectPct, setDefectPct] = useState(loaded?.defectPct ?? 0.05)
  const [currency, setCurrency] = useState<'RUB' | 'USD'>(loaded?.currency ?? 'RUB')
  const [fxRate, setFxRate] = useState(loaded?.fxRate ?? 95)
  const [supplierMode, setSupplierMode] = useState<SupplierPickMode>(loaded?.supplierMode ?? 'cheapest')

  const skus = skusQuery.data ?? []
  const supplierFabrics = sfQuery.data ?? []
  const suppliers = suppliersQuery.data ?? []

  const fabricById = useMemo(() => new Map((fabricsQuery.data ?? []).map((f) => [f.id, f])), [fabricsQuery.data])
  const supplierName = useMemo(
    () => new Map((suppliersQuery.data ?? []).map((s) => [s.id, s.name])),
    [suppliersQuery.data],
  )

  // Persist the calculator inputs so a return visit restores the last session.
  useEffect(() => {
    saveCalcState({ skuId, selections, sizeQ, reservePct, defectPct, currency, fxRate, supplierMode })
  }, [skuId, selections, sizeQ, reservePct, defectPct, currency, fxRate, supplierMode])

  const selectedSku = skus.find((s) => s.id === skuId) ?? null
  const components = selectedSku?.passport?.components ?? []
  const sizes = selectedSku?.passport
    ? SIZE_ORDER.filter((s) => s in (selectedSku.passport!.sizeCoefficients as Record<string, number>))
    : []

  function suppliersForFabric(fabricId: string): SupplierFabricDto[] {
    return supplierFabrics.filter((sf) => sf.fabricId === fabricId)
  }

  function onSelectSku(nextSkuId: string) {
    setSkuId(nextSkuId)
    const sku = skus.find((s) => s.id === nextSkuId)
    const nextSelections: Record<string, Selection> = {}
    for (const c of sku?.passport?.components ?? []) {
      const fabricId = c.allowedFabricIds[0] ?? ''
      nextSelections[c.id] = {
        fabricId,
        supplierId: pickSupplierFor(supplierMode, fabricId, supplierFabrics, suppliers, currency, fxRate),
      }
    }
    setSelections(nextSelections)
    setSizeQ({})
  }

  function setComponentFabric(componentId: string, fabricId: string) {
    setSelections((prev) => ({
      ...prev,
      [componentId]: {
        fabricId,
        supplierId: pickSupplierFor(supplierMode, fabricId, supplierFabrics, suppliers, currency, fxRate),
      },
    }))
  }

  // A manual supplier choice switches the picker to "Вручную" so it is not re-applied.
  function setComponentSupplier(componentId: string, supplierId: string) {
    setSupplierMode('manual')
    setSelections((prev) => ({ ...prev, [componentId]: { ...prev[componentId], supplierId } }))
  }

  // Re-pick the supplier for every component — used when the picker mode, currency or fx changes.
  function reapplySuppliers(mode: SupplierPickMode, curr: 'RUB' | 'USD', fx: number) {
    if (mode === 'manual') return
    setSelections((prev) => {
      const next = { ...prev }
      for (const id of Object.keys(prev)) {
        const fabricId = prev[id]?.fabricId ?? ''
        if (!fabricId) continue
        next[id] = { fabricId, supplierId: pickSupplierFor(mode, fabricId, supplierFabrics, suppliers, curr, fx) }
      }
      return next
    })
  }

  function onChangeSupplierMode(mode: SupplierPickMode) {
    setSupplierMode(mode)
    reapplySuppliers(mode, currency, fxRate)
  }

  const buildInput = () => ({
    skuId,
    sizeBreakdown: Object.fromEntries(
      Object.entries(sizeQ).filter(([, q]) => Number(q) > 0).map(([s, q]) => [s, Number(q)]),
    ),
    componentSelections: components.map((c) => ({
      componentId: c.id,
      fabricId: selections[c.id]?.fabricId ?? '',
      supplierId: selections[c.id]?.supplierId ?? '',
    })),
    reservePct,
    defectPct,
    currency,
    fxRate,
  })

  const createMutation = useMutation({
    mutationFn: (mode: 'TEST' | 'ORDER') => api.createOrder({ ...buildInput(), mode }),
    onSuccess: (order) => {
      toast.success(order.mode === 'ORDER' ? 'Заказ создан' : 'Тест сохранён')
      navigate({ to: '/orders/$id', params: { id: order.id } })
    },
    onError: (error) => toast.error('Не удалось сохранить', { description: errMessage(error) }),
  })

  const totalGarments = Object.values(sizeQ).reduce((sum, q) => sum + (Number(q) || 0), 0)
  const ready =
    Boolean(skuId) &&
    totalGarments > 0 &&
    components.every((c) => selections[c.id]?.fabricId && selections[c.id]?.supplierId)

  // Live calculation: debounce the input, then auto-run /api/calc (no "Рассчитать" button).
  const inputKey = JSON.stringify(buildInput())
  const [debouncedKey, setDebouncedKey] = useState(inputKey)
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => setDebouncedKey(inputKey), 400)
    return () => clearTimeout(timer)
  }, [inputKey, ready])

  const calcQuery = useQuery({
    queryKey: ['calc', debouncedKey],
    queryFn: () => api.calc(JSON.parse(debouncedKey) as CalcRequest),
    enabled: ready,
    placeholderData: keepPreviousData,
  })
  const result = ready ? calcQuery.data : undefined

  function clearAll() {
    setSkuId('')
    setSelections({})
    setSizeQ({})
    setReservePct(0.05)
    setDefectPct(0.05)
    setCurrency('RUB')
    setFxRate(95)
    setSupplierMode('cheapest')
    clearCalcState()
  }

  const refQueries = [skusQuery, fabricsQuery, sfQuery, suppliersQuery]
  const failedQuery = refQueries.find((q) => q.isError)
  if (failedQuery) {
    return (
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10">
        <PageHeader
          eyebrow="Калькулятор закупки"
          title="Расчёт потребности в ткани"
          description="Выберите модель, ткани и поставщиков, задайте размерный ряд и резерв — получите объём закупки и стоимость."
        />
        <Card>
          <CardContent className="pt-6">
            <DataError
              error={failedQuery.error}
              onRetry={() => refQueries.forEach((q) => void q.refetch())}
              title="Не удалось загрузить справочники"
            />
          </CardContent>
        </Card>
      </section>
    )
  }

  if (skusQuery.isLoading) {
    return <PageSkeleton />
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10">
      <PageHeader
        eyebrow="Калькулятор закупки"
        title="Расчёт потребности в ткани"
        description="Выберите модель, ткани и поставщиков, задайте размерный ряд и резерв — получите объём закупки и стоимость."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Параметры</CardTitle>
            <CardDescription>Модель, компоненты и размерный ряд</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field>
              <FieldLabel>Модель (SKU)</FieldLabel>
              <NativeSelect value={selectedSku?.id ?? ''} onChange={(e) => onSelectSku(e.target.value)}>
                <NativeSelectOption value="">— выберите модель —</NativeSelectOption>
                {skus.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel>Подбор поставщика</FieldLabel>
              <NativeSelect
                value={supplierMode}
                onChange={(e) => onChangeSupplierMode(e.target.value as SupplierPickMode)}
              >
                <NativeSelectOption value="cheapest">Автоматически — дешевле</NativeSelectOption>
                <NativeSelectOption value="fastest">Автоматически — быстрее</NativeSelectOption>
                <NativeSelectOption value="manual">Вручную</NativeSelectOption>
              </NativeSelect>
            </Field>

            {components.map((c) => {
              const sel = selections[c.id]
              const sfList = suppliersForFabric(sel?.fabricId ?? '')
              const cheapestId = cheapestSupplierFor(sel?.fabricId ?? '', supplierFabrics, currency, fxRate)
              const allowedFabrics = c.allowedFabricIds
                .map((fid) => fabricById.get(fid))
                .filter((f): f is FabricDto => Boolean(f))
              const groups = groupFabricsByType(allowedFabrics)
              const current = fabricById.get(sel?.fabricId ?? '')
              const currentKey = current ? fabricTypeKey(current) : ''
              const densities = groups.find((g) => g.key === currentKey)?.fabrics ?? []
              return (
                <div key={c.id} className="grid gap-3 rounded-xl border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="w-fit">
                      {c.name?.trim() || ROLE_LABELS[c.role] || c.role}
                    </Badge>
                    {c.name?.trim() && (
                      <Typography variant="bodyXs" as="span" tone="muted">
                        {ROLE_LABELS[c.role] ?? c.role}
                      </Typography>
                    )}
                  </div>
                  <Field>
                    <FieldLabel>Ткань</FieldLabel>
                    <NativeSelect
                      value={currentKey}
                      onChange={(e) => {
                        const group = groups.find((g) => g.key === e.target.value)
                        if (group?.fabrics[0]) setComponentFabric(c.id, group.fabrics[0].id)
                      }}
                    >
                      {groups.map((g) => (
                        <NativeSelectOption key={g.key} value={g.key}>
                          {g.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field>
                      <FieldLabel>Плотность</FieldLabel>
                      <NativeSelect
                        value={sel?.fabricId ?? ''}
                        onChange={(e) => setComponentFabric(c.id, e.target.value)}
                      >
                        {densities.map((f) => (
                          <NativeSelectOption key={f.id} value={f.id}>
                            {fabricDensityLabel(f, densities)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel>Поставщик</FieldLabel>
                      <NativeSelect
                        value={sel?.supplierId ?? ''}
                        onChange={(e) => setComponentSupplier(c.id, e.target.value)}
                      >
                        {sfList.length === 0 && <NativeSelectOption value="">— нет поставщиков —</NativeSelectOption>}
                        {sfList.map((sf) => (
                          <NativeSelectOption key={sf.id} value={sf.supplierId}>
                            {supplierName.get(sf.supplierId) ?? sf.supplierId} ·{' '}
                            {currency === 'RUB' ? `${sf.priceRub ?? '—'} ₽/кг` : `${sf.priceUsd ?? '—'} $/кг`}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  </div>
                  {sfList.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sfList.map((sf) => {
                        const isCheapest = sf.supplierId === cheapestId
                        const priceLabel =
                          currency === 'RUB' ? `${sf.priceRub ?? '—'} ₽` : `${sf.priceUsd ?? '—'} $`
                        return (
                          <Badge key={sf.id} variant={isCheapest ? 'success' : 'outline'}>
                            {supplierName.get(sf.supplierId) ?? sf.supplierId} · {priceLabel}/кг
                            {isCheapest ? ' · дешевле' : ''}
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {sizes.length > 0 && (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel>Размерный ряд (кол-во изделий)</FieldLabel>
                  <Badge variant="outline">Всего: {totalGarments}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {sizes.map((s) => (
                    <Field key={s}>
                      <FieldLabel>{s}</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        value={sizeQ[s] ?? ''}
                        onChange={(e) => setSizeQ((prev) => ({ ...prev, [s]: Number(e.target.value) }))}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Резерв на заказ</FieldLabel>
                <NativeSelect value={String(reservePct)} onChange={(e) => setReservePct(Number(e.target.value))}>
                  {RESERVE_OPTIONS.map((r) => (
                    <NativeSelectOption key={r} value={String(r)}>
                      {Math.round(r * 100)}%
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>На брак</FieldLabel>
                <NativeSelect value={String(defectPct)} onChange={(e) => setDefectPct(Number(e.target.value))}>
                  {DEFECT_OPTIONS.map((r) => (
                    <NativeSelectOption key={r} value={String(r)}>
                      {Math.round(r * 100)}%
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Валюта</FieldLabel>
                <NativeSelect
                  value={currency}
                  onChange={(e) => {
                    const next = e.target.value as 'RUB' | 'USD'
                    setCurrency(next)
                    reapplySuppliers(supplierMode, next, fxRate)
                  }}
                >
                  <NativeSelectOption value="RUB">₽ (рубли)</NativeSelectOption>
                  <NativeSelectOption value="USD">$ × курс</NativeSelectOption>
                </NativeSelect>
              </Field>
              {currency === 'USD' && (
                <Field>
                  <FieldLabel>Курс $ → ₽</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    value={fxRate}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      setFxRate(next)
                      reapplySuppliers(supplierMode, currency, next)
                    }}
                  />
                </Field>
              )}
            </div>

            <div className="-mx-6 -mb-6 mt-1 flex flex-wrap gap-2 border-t bg-muted/20 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                disabled={!ready || createMutation.isPending}
                onClick={() => createMutation.mutate('TEST')}
              >
                Сохранить как тест
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!ready || createMutation.isPending}
                onClick={() => createMutation.mutate('ORDER')}
              >
                Создать заказ
              </Button>
              <Button type="button" variant="ghost" className="ml-auto" onClick={clearAll}>
                Очистить
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Результат</CardTitle>
            <CardDescription>Потребность, закупка и стоимость</CardDescription>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <Empty className="border-0 p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={Calculator01Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>Результата пока нет</EmptyTitle>
                  <EmptyDescription>
                    Выберите модель, ткани с поставщиками и размерный ряд — расчёт появится здесь автоматически.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : calcQuery.isError ? (
              <DataError error={calcQuery.error} onRetry={() => void calcQuery.refetch()} title="Не удалось рассчитать" />
            ) : result ? (
              <div className="grid gap-3">
                {calcQuery.isFetching && (
                  <Typography variant="bodyXs" tone="muted">
                    Обновляем…
                  </Typography>
                )}
                <ResultView result={result} fabricById={fabricById} />
                <PurchaseRequest
                  result={result}
                  selections={selections}
                  supplierName={supplierName}
                  fabricById={fabricById}
                />
              </div>
            ) : (
              <div className="grid gap-3 p-6">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

type PurchaseLine = {
  fabricId: string
  label: string
  orderQty: number
  rollUnit: string
  rollsCount: number
  rollSize: number
  pricePerUnit: number
  priceUnit: string
  priceCurrency: 'RUB' | 'USD'
  costRub: number
}
type SupplierGroup = { supplierId: string; supplierName: string; lines: PurchaseLine[]; subtotalRub: number }

// Regroup the engine result (keyed by fabric) into a per-supplier purchase request:
// what to order from each supplier, with line costs and a subtotal. The fabric→supplier
// mapping comes from the calculator selections.
function buildPurchaseRequest(
  result: CalcResult,
  selections: Record<string, Selection>,
  supplierName: Map<string, string>,
  fabricById: Map<string, FabricDto>,
): SupplierGroup[] {
  const fabricToSupplier = new Map<string, string>()
  for (const sel of Object.values(selections)) {
    if (sel.fabricId && !fabricToSupplier.has(sel.fabricId)) fabricToSupplier.set(sel.fabricId, sel.supplierId)
  }
  const bySupplier = new Map<string, SupplierGroup>()
  for (const f of result.fabrics) {
    const supplierId = fabricToSupplier.get(f.fabricId) ?? ''
    let group = bySupplier.get(supplierId)
    if (!group) {
      group = { supplierId, supplierName: supplierName.get(supplierId) ?? 'Поставщик не выбран', lines: [], subtotalRub: 0 }
      bySupplier.set(supplierId, group)
    }
    group.lines.push({
      fabricId: f.fabricId,
      label: formatFabricLabel(fabricById.get(f.fabricId)) || f.fabricName || f.fabricId,
      orderQty: f.orderQty,
      rollUnit: f.rollUnit,
      rollsCount: f.rollsCount,
      rollSize: f.rollSize,
      pricePerUnit: f.pricePerUnit,
      priceUnit: f.priceUnit,
      priceCurrency: f.priceCurrency,
      costRub: f.costRub,
    })
    group.subtotalRub += f.costRub
  }
  return [...bySupplier.values()]
}

const unitRu = (u: string) => (u === 'kg' ? 'кг' : 'м')
const curSign = (c: 'RUB' | 'USD') => (c === 'RUB' ? '₽' : '$')

function purchaseRequestText(groups: SupplierGroup[], totalRub: number): string {
  const out: string[] = ['Заявка поставщикам', '']
  for (const g of groups) {
    out.push(g.supplierName)
    for (const l of g.lines) {
      out.push(
        `- ${l.label}: ${fmt(l.orderQty, 0)} ${l.rollUnit} × ${fmt(l.pricePerUnit, 2)} ${curSign(l.priceCurrency)}/${unitRu(l.priceUnit)} = ${money(l.costRub)} ₽`,
      )
    }
    out.push(`Итого по поставщику: ${money(g.subtotalRub)} ₽`, '')
  }
  out.push(`Всего к закупке: ${money(totalRub)} ₽`)
  return out.join('\n')
}

// Per-supplier purchase request the buyer can print (browser → Save as PDF) or copy.
function PurchaseRequest({
  result,
  selections,
  supplierName,
  fabricById,
}: {
  result: CalcResult
  selections: Record<string, Selection>
  supplierName: Map<string, string>
  fabricById: Map<string, FabricDto>
}) {
  const groups = buildPurchaseRequest(result, selections, supplierName, fabricById)
  if (groups.length === 0) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(purchaseRequestText(groups, result.totalCostRub))
      toast.success('Заявка скопирована')
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  return (
    <div id="purchase-request" className="grid gap-4 rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="h6" as="h3">
          Заявка поставщикам
        </Typography>
        <div className="flex gap-2 print:hidden">
          <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
            Печать
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={copy}>
            Копировать
          </Button>
        </div>
      </div>
      {groups.map((g) => (
        <div key={g.supplierId || 'none'} className="grid gap-2">
          <Typography variant="bodySm" tone="primary">
            {g.supplierName}
          </Typography>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ткань</TableHead>
                <TableHead>К закупке</TableHead>
                <TableHead>Цена</TableHead>
                <TableHead>Сумма</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.lines.map((l) => (
                <TableRow key={l.fabricId}>
                  <TableCell className="whitespace-normal">{l.label}</TableCell>
                  <TableCell>
                    {fmt(l.orderQty, 0)} {l.rollUnit}
                    <br />
                    <Typography variant="bodyXs" as="span" tone="muted">
                      {l.rollsCount} рул. × {l.rollSize}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {fmt(l.pricePerUnit, 2)} {curSign(l.priceCurrency)}/{unitRu(l.priceUnit)}
                  </TableCell>
                  <TableCell>{money(l.costRub)} ₽</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-baseline justify-between border-t pt-2">
            <Typography variant="bodySm" tone="muted" as="span">
              Итого по поставщику
            </Typography>
            <Typography variant="bodySm" tone="primary" as="span" className="tnum">
              {money(g.subtotalRub)} ₽
            </Typography>
          </div>
        </div>
      ))}
      <div className="flex items-baseline justify-between border-t pt-2">
        <Typography variant="bodySm" as="span">
          Всего к закупке
        </Typography>
        <Typography variant="bodySm" tone="primary" as="span" className="tnum">
          {money(result.totalCostRub)} ₽
        </Typography>
      </div>
    </div>
  )
}

function ResultView({ result, fabricById }: { result: CalcResult; fabricById: Map<string, FabricDto> }) {
  return (
    <div className="grid gap-5">
      <div className="rounded-xl border bg-muted/40 p-4">
        <Typography variant="bodySm" tone="muted">
          Итого закупка
        </Typography>
        <div className="mt-1 flex items-baseline gap-1.5">
          <Typography variant="h1" as="span" tone="primary" className="tnum">
            {money(result.totalCostRub)}
          </Typography>
          <Typography variant="h4" as="span" tone="muted">
            ₽
          </Typography>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{result.totalGarments} изд.</Badge>
          <Badge variant="secondary">резерв {Math.round(result.reservePct * 100)}%</Badge>
          {result.defectPct > 0 && <Badge variant="secondary">брак {Math.round(result.defectPct * 100)}%</Badge>}
          <Badge variant="outline">перекос ×{fmt(result.perekos, 3)}</Badge>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ткань</TableHead>
            <TableHead>Потребность</TableHead>
            <TableHead>Закупка</TableHead>
            <TableHead>Стоимость</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.fabrics.map((f) => (
            <TableRow key={f.fabricId}>
              <TableCell className="whitespace-normal">
                {formatFabricLabel(fabricById.get(f.fabricId)) || f.fabricName || f.fabricId}
              </TableCell>
              <TableCell>
                {fmt(f.needKg)} кг
                <br />
                <Typography variant="bodyXs" as="span" tone="muted">
                  {fmt(f.needM)} м
                </Typography>
              </TableCell>
              <TableCell>
                {fmt(f.orderQty, 0)} {f.rollUnit}
                <br />
                <Typography variant="bodyXs" as="span" tone="muted">
                  {f.rollsCount} рул. × {f.rollSize}
                </Typography>
              </TableCell>
              <TableCell>{money(f.costRub)} ₽</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <CoefficientBreakdown result={result} fabricById={fabricById} />

      <Typography variant="bodyXs" tone="muted">
        Взвешенное количество: {fmt(result.sizeWeightedQty, 2)}
      </Typography>
    </div>
  )
}

// Surfaces the per-component coefficient chain the engine already computes, so the
// "коэффициент усложнения" is no longer a black box: base norm → layout → losses →
// pre-shrink → net (specs/tz-calculator.md §8 "расшифровка коэффициентов").
function CoefficientBreakdown({
  result,
  fabricById,
}: {
  result: CalcResult
  fabricById: Map<string, FabricDto>
}) {
  return (
    <details className="group rounded-xl border bg-muted/20 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <Typography variant="control" as="span">
          Как считается расход (коэффициенты)
        </Typography>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="grid gap-4 border-t px-4 py-4">
        {result.fabrics.map((f) => (
          <div key={f.fabricId} className="grid gap-2">
            <Typography variant="bodySm" tone="primary">
              {formatFabricLabel(fabricById.get(f.fabricId)) || f.fabricName || f.fabricId}
            </Typography>
            {f.components.map((c) => {
              const unit = f.canonicalUnit
              return (
                <div key={c.componentId} className="grid gap-1 rounded-lg bg-background/60 p-3">
                  <Typography variant="bodyXs" tone="muted">
                    {c.componentName?.trim() || ROLE_LABELS[c.role] || c.role}
                  </Typography>
                  <BreakdownStep label="Базовый расход (норма × взвеш. кол-во)" value={`${fmt(c.rawQty)} ${unit}`} />
                  <BreakdownStep
                    label={`× Раскладка (перекос ×${fmt(c.perekos, 3)}, ширина ×${fmt(c.widthEffect, 3)})`}
                    value={`×${fmt(c.layoutCoef, 3)}`}
                  />
                  <BreakdownStep label="× Потери (раскрой + пошив)" value={`×${fmt(c.lossFactor, 3)}`} />
                  <BreakdownStep label="× Усадка ткани" value={`×${fmt(c.preShrinkFactor, 3)}`} />
                  <div className="mt-1 border-t pt-1">
                    <BreakdownStep label="= Нетто на партию" value={`${fmt(c.netQty)} ${unit}`} strong />
                  </div>
                </div>
              )
            })}
            <div className="grid gap-1 px-1">
              <BreakdownStep
                label={`+ Резерв на заказ (${Math.round(result.reservePct * 100)}%)`}
                value={`+${fmt(f.canonicalUnit === 'm' ? f.reserveM : f.reserveKg)} ${f.canonicalUnit}`}
              />
              {result.defectPct > 0 && (
                <BreakdownStep
                  label={`+ На брак (${Math.round(result.defectPct * 100)}%)`}
                  value={`+${fmt(f.canonicalUnit === 'm' ? f.defectM : f.defectKg)} ${f.canonicalUnit}`}
                />
              )}
              <BreakdownStep
                label="= К закупке (округление до рулона)"
                value={`${fmt(f.orderQty, 0)} ${f.rollUnit} · ${f.rollsCount} рул.`}
                strong
              />
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

function BreakdownStep({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Typography variant="bodySm" as="span" tone={strong ? 'primary' : 'muted'}>
        {label}
      </Typography>
      <Typography variant="bodySm" as="span" tone={strong ? 'primary' : 'default'} className="tnum whitespace-nowrap">
        {value}
      </Typography>
    </div>
  )
}

// ---------------- Orders list ----------------

export function OrdersPage() {
  return (
    <RequireAuth>
      <OrdersInner />
    </RequireAuth>
  )
}

function OrdersInner() {
  const { api } = useAuth()
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: () => api.listOrders() })
  const orders = ordersQuery.data ?? []

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10">
      <PageHeader
        title="Заказы"
        description="Сохранённые расчёты и заказы. Откройте запись, чтобы внести факт по производству."
        actions={
          <Button asChild>
            <Link to="/">
              <HugeiconsIcon icon={Calculator01Icon} strokeWidth={2} />
              Новый расчёт
            </Link>
          </Button>
        }
      />
      {ordersQuery.isError ? (
        <Card>
          <CardContent className="pt-6">
            <DataError
              error={ordersQuery.error}
              onRetry={() => void ordersQuery.refetch()}
              title="Не удалось загрузить заказы"
            />
          </CardContent>
        </Card>
      ) : ordersQuery.isLoading ? (
        <Card>
          <CardContent className="grid gap-3 pt-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : orders.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Invoice01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>Заказов пока нет</EmptyTitle>
            <EmptyDescription>Создайте первый расчёт на экране калькулятора.</EmptyDescription>
          </EmptyHeader>
          <Button asChild>
            <Link to="/">Перейти к расчёту</Link>
          </Button>
        </Empty>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Режим</TableHead>
                  <TableHead>Модель</TableHead>
                  <TableHead>Изделий</TableHead>
                  <TableHead>Стоимость</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Badge variant={o.mode === 'ORDER' ? 'default' : 'outline'}>
                        {o.mode === 'ORDER' ? 'Заказ' : 'Тест'}
                      </Badge>
                    </TableCell>
                    <TableCell>{o.skuName ?? o.skuId}</TableCell>
                    <TableCell>{o.totalGarments}</TableCell>
                    <TableCell>{money(o.totalCostRub)} ₽</TableCell>
                    <TableCell>{new Date(o.createdAt).toLocaleString('ru-RU')}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/orders/$id" params={{ id: o.id }}>
                          Открыть
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

// ---------------- Order detail + fact entry ----------------

type FactInput = {
  actualConsumed: number
  wasteFabric: number
  wasteSewing: number
  wasteNatural: number
  producedQty: number
}

export function OrderDetailPage() {
  return (
    <RequireAuth>
      <OrderDetailInner />
    </RequireAuth>
  )
}

function OrderDetailInner() {
  const { api } = useAuth()
  const queryClient = useQueryClient()
  const params = useParams({ strict: false }) as { id?: string }
  const id = params.id ?? ''

  const orderQuery = useQuery({ queryKey: ['orders', id], queryFn: () => api.getOrder(id), enabled: Boolean(id) })
  const order = orderQuery.data

  const fabricsQuery = useQuery({ queryKey: ['fabrics'], queryFn: () => api.listFabrics() })
  const fabricById = useMemo(() => new Map((fabricsQuery.data ?? []).map((f) => [f.id, f])), [fabricsQuery.data])

  const [facts, setFacts] = useState<Record<string, FactInput>>({})

  const addFactMutation = useMutation({
    mutationFn: () => {
      const payload = Object.entries(facts)
        .filter(([, f]) => f.actualConsumed > 0 || f.producedQty > 0)
        .map(([fabricId, f]) => ({ fabricId, ...f }))
      return api.addFact(id, { facts: payload })
    },
    onSuccess: () => {
      setFacts({})
      toast.success('Факт сохранён')
      void queryClient.invalidateQueries({ queryKey: ['orders', id] })
    },
    onError: (error) => toast.error('Не удалось сохранить факт', { description: errMessage(error) }),
  })

  if (orderQuery.isLoading) {
    return <PageSkeleton />
  }
  if (orderQuery.isError) {
    return (
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-16">
        <DataError
          error={orderQuery.error}
          onRetry={() => void orderQuery.refetch()}
          title="Не удалось загрузить заказ"
        />
      </section>
    )
  }
  if (!order) {
    return (
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-16">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Invoice01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>Заказ не найден</EmptyTitle>
            <EmptyDescription>Возможно, запись была удалена или ссылка устарела.</EmptyDescription>
          </EmptyHeader>
          <Button asChild>
            <Link to="/orders">К списку заказов</Link>
          </Button>
        </Empty>
      </section>
    )
  }

  function setFact(fabricId: string, patch: Partial<FactInput>) {
    setFacts((prev) => {
      const base: FactInput = prev[fabricId] ?? {
        actualConsumed: 0,
        wasteFabric: 0,
        wasteSewing: 0,
        wasteNatural: 0,
        producedQty: 0,
      }
      return { ...prev, [fabricId]: { ...base, ...patch } }
    })
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10">
      <PageHeader
        title="Заказ"
        description={
          <span className="inline-flex items-center gap-2">
            <Badge variant={order.mode === 'ORDER' ? 'default' : 'outline'}>
              {order.mode === 'ORDER' ? 'Заказ' : 'Тест'}
            </Badge>
            <Typography variant="bodySm" as="span" tone="muted">
              {new Date(order.createdAt).toLocaleString('ru-RU')}
            </Typography>
          </span>
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/orders">
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
              К списку
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>План (сохранённый расчёт)</CardTitle>
          <CardDescription>Итого: {money(order.result.totalCostRub)} ₽</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ткань</TableHead>
                <TableHead>План, кг</TableHead>
                <TableHead>Закупка</TableHead>
                <TableHead>Стоимость</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.result.fabrics.map((f) => (
                <TableRow key={f.fabricId}>
                  <TableCell>{formatFabricLabel(fabricById.get(f.fabricId)) || f.fabricName || f.fabricId}</TableCell>
                  <TableCell>{fmt(f.needKg)}</TableCell>
                  <TableCell>
                    {fmt(f.orderQty, 0)} {f.rollUnit} ({f.rollsCount} рул.)
                  </TableCell>
                  <TableCell>{money(f.costRub)} ₽</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Факт по производству</CardTitle>
          <CardDescription>Введите реальный расход по тканям — посчитаем отклонение от плана</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ткань</TableHead>
                <TableHead>Факт, кг</TableHead>
                <TableHead>Брак ткани</TableHead>
                <TableHead>Брак пошива</TableHead>
                <TableHead>Ест. отходы</TableHead>
                <TableHead>Годных, шт</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.result.fabrics.map((f) => {
                const fact = facts[f.fabricId]
                return (
                  <TableRow key={f.fabricId}>
                    <TableCell>{formatFabricLabel(fabricById.get(f.fabricId)) || f.fabricName || f.fabricId}</TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={fact?.actualConsumed ?? ''} onChange={(e) => setFact(f.fabricId, { actualConsumed: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={fact?.wasteFabric ?? ''} onChange={(e) => setFact(f.fabricId, { wasteFabric: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={fact?.wasteSewing ?? ''} onChange={(e) => setFact(f.fabricId, { wasteSewing: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={fact?.wasteNatural ?? ''} onChange={(e) => setFact(f.fabricId, { wasteNatural: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={fact?.producedQty ?? ''} onChange={(e) => setFact(f.fabricId, { producedQty: Number(e.target.value) })} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div>
            <Button type="button" disabled={addFactMutation.isPending} onClick={() => addFactMutation.mutate()}>
              {addFactMutation.isPending ? 'Сохраняем…' : 'Сохранить факт'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {order.facts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Внесённый факт и отклонение</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ткань</TableHead>
                  <TableHead>Факт, кг</TableHead>
                  <TableHead>План, кг</TableHead>
                  <TableHead>Отклонение</TableHead>
                  <TableHead>Годных</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.facts.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{formatFabricLabel(fabricById.get(f.fabricId)) || order.result.fabrics.find((rf) => rf.fabricId === f.fabricId)?.fabricName || f.fabricId}</TableCell>
                    <TableCell>{fmt(f.actualConsumed)}</TableCell>
                    <TableCell>{f.plannedKg === null ? '—' : fmt(f.plannedKg)}</TableCell>
                    <TableCell>
                      {f.deviation === null ? (
                        '—'
                      ) : (
                        <Badge variant={f.deviation > 0 ? 'destructive' : 'success'}>
                          {f.deviation > 0 ? '+' : ''}
                          {fmt(f.deviation * 100, 1)}%
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{f.producedQty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
