import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import type { CalcResult, FabricDto, SupplierFabricDto } from '@web-app-demo/contracts'
import { useMemo, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { ApiRequestError } from '@/lib/api'
import { useAuth } from '@/lib/use-auth'

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const RESERVE_OPTIONS = [0, 0.03, 0.05, 0.07, 0.1]

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

// Authentication is intentionally disabled for the open demo — render directly.
function RequireAuth({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

// ---------------- Calculator ----------------

type Selection = { fabricId: string; supplierId: string }

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

  const [skuId, setSkuId] = useState('')
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [sizeQ, setSizeQ] = useState<Record<string, number>>({})
  const [reservePct, setReservePct] = useState(0.05)
  const [currency, setCurrency] = useState<'RUB' | 'USD'>('RUB')
  const [fxRate, setFxRate] = useState(95)

  const skus = skusQuery.data ?? []
  const fabrics = fabricsQuery.data ?? []
  const supplierFabrics = sfQuery.data ?? []
  const suppliers = suppliersQuery.data ?? []

  const fabricById = useMemo(() => new Map(fabrics.map((f) => [f.id, f])), [fabrics])
  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers])

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
    calcMutation.reset()
    const sku = skus.find((s) => s.id === nextSkuId)
    const nextSelections: Record<string, Selection> = {}
    for (const c of sku?.passport?.components ?? []) {
      const fabricId = c.allowedFabricIds[0] ?? ''
      const firstSf = supplierFabrics.find((sf) => sf.fabricId === fabricId)
      nextSelections[c.id] = { fabricId, supplierId: firstSf?.supplierId ?? '' }
    }
    setSelections(nextSelections)
    setSizeQ({})
  }

  function setComponentFabric(componentId: string, fabricId: string) {
    const firstSf = supplierFabrics.find((sf) => sf.fabricId === fabricId)
    setSelections((prev) => ({ ...prev, [componentId]: { fabricId, supplierId: firstSf?.supplierId ?? '' } }))
  }

  function setComponentSupplier(componentId: string, supplierId: string) {
    setSelections((prev) => ({ ...prev, [componentId]: { ...prev[componentId], supplierId } }))
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
    currency,
    fxRate,
  })

  const calcMutation = useMutation({ mutationFn: () => api.calc(buildInput()) })
  const createMutation = useMutation({
    mutationFn: (mode: 'TEST' | 'ORDER') => api.createOrder({ ...buildInput(), mode }),
    onSuccess: (order) => navigate({ to: '/orders/$id', params: { id: order.id } }),
  })

  const totalGarments = Object.values(sizeQ).reduce((sum, q) => sum + (Number(q) || 0), 0)
  const ready =
    Boolean(skuId) &&
    totalGarments > 0 &&
    components.every((c) => selections[c.id]?.fabricId && selections[c.id]?.supplierId)

  const result = calcMutation.data

  if (skusQuery.isLoading) {
    return (
      <section className="mx-auto w-full max-w-6xl px-5 py-16">
        <Card className="w-fit">
          <CardContent className="flex items-center gap-3">
            <Spinner />
            <Typography variant="bodySm" tone="muted">
              Загружаем справочники…
            </Typography>
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10">
      <div className="grid gap-2">
        <Badge variant="outline" className="w-fit">
          Калькулятор закупки
        </Badge>
        <Typography variant="h1">Расчёт потребности в ткани</Typography>
        <Typography tone="muted">
          Выберите модель, ткани и поставщиков, задайте размерный ряд и резерв — получите объём закупки и стоимость.
        </Typography>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Параметры</CardTitle>
            <CardDescription>Модель, компоненты и размерный ряд</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Field>
              <FieldLabel>Модель (SKU)</FieldLabel>
              <NativeSelect value={skuId} onChange={(e) => onSelectSku(e.target.value)}>
                <NativeSelectOption value="">— выберите модель —</NativeSelectOption>
                {skus.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            {components.map((c) => {
              const sel = selections[c.id]
              const sfList = suppliersForFabric(sel?.fabricId ?? '')
              return (
                <div key={c.id} className="grid gap-3 rounded-md border p-3">
                  <Typography variant="control" tone="muted">
                    Компонент: {c.role}
                  </Typography>
                  <Field>
                    <FieldLabel>Ткань</FieldLabel>
                    <NativeSelect
                      value={sel?.fabricId ?? ''}
                      onChange={(e) => setComponentFabric(c.id, e.target.value)}
                    >
                      {c.allowedFabricIds.map((fid) => (
                        <NativeSelectOption key={fid} value={fid}>
                          {fabricById.get(fid)?.name ?? fid}
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
              )
            })}

            {sizes.length > 0 && (
              <div className="grid gap-2">
                <FieldLabel>Размерный ряд (кол-во изделий)</FieldLabel>
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
                <Typography variant="bodySm" tone="muted">
                  Всего изделий: {totalGarments}
                </Typography>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Резерв</FieldLabel>
                <NativeSelect value={String(reservePct)} onChange={(e) => setReservePct(Number(e.target.value))}>
                  {RESERVE_OPTIONS.map((r) => (
                    <NativeSelectOption key={r} value={String(r)}>
                      {Math.round(r * 100)}%
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Валюта</FieldLabel>
                <NativeSelect value={currency} onChange={(e) => setCurrency(e.target.value as 'RUB' | 'USD')}>
                  <NativeSelectOption value="RUB">₽ (рубли)</NativeSelectOption>
                  <NativeSelectOption value="USD">$ × курс</NativeSelectOption>
                </NativeSelect>
              </Field>
              {currency === 'USD' && (
                <Field>
                  <FieldLabel>Курс $ → ₽</FieldLabel>
                  <Input type="number" min={0} value={fxRate} onChange={(e) => setFxRate(Number(e.target.value))} />
                </Field>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!ready || calcMutation.isPending} onClick={() => calcMutation.mutate()}>
                {calcMutation.isPending ? 'Считаем…' : 'Рассчитать'}
              </Button>
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
            </div>

            {(calcMutation.isError || createMutation.isError) && (
              <Alert variant="destructive">
                <AlertTitle>Ошибка</AlertTitle>
                <AlertDescription>{errMessage(calcMutation.error ?? createMutation.error)}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Результат</CardTitle>
            <CardDescription>Потребность, закупка и стоимость</CardDescription>
          </CardHeader>
          <CardContent>
            {result ? <ResultView result={result} fabricById={fabricById} /> : (
              <Typography tone="muted">Заполните параметры и нажмите «Рассчитать».</Typography>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function ResultView({ result, fabricById }: { result: CalcResult; fabricById: Map<string, FabricDto> }) {
  return (
    <div className="grid gap-4">
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
              <TableCell>{f.fabricName || fabricById.get(f.fabricId)?.name || f.fabricId}</TableCell>
              <TableCell>
                {fmt(f.needKg)} кг
                <br />
                <span className="text-muted-foreground">{fmt(f.needM)} м</span>
              </TableCell>
              <TableCell>
                {fmt(f.orderQty, 0)} {f.rollUnit}
                <br />
                <span className="text-muted-foreground">{f.rollsCount} рул. × {f.rollSize}</span>
              </TableCell>
              <TableCell>{money(f.costRub)} ₽</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Separator />
      <div className="flex items-center justify-between">
        <Typography variant="control" tone="muted">
          Итого ({result.totalGarments} изд., резерв {Math.round(result.reservePct * 100)}%)
        </Typography>
        <Typography variant="h4">{money(result.totalCostRub)} ₽</Typography>
      </div>
      <Typography variant="bodySm" tone="muted">
        Перекос размерного ряда: ×{fmt(result.perekos, 4)} · взвеш. кол-во: {fmt(result.sizeWeightedQty, 2)}
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
      <div className="flex items-center justify-between">
        <Typography variant="h1">Заказы</Typography>
        <Button asChild>
          <Link to="/">Новый расчёт</Link>
        </Button>
      </div>
      {ordersQuery.isLoading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <Typography tone="muted">Заказов пока нет. Создайте первый на экране расчёта.</Typography>
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
      void queryClient.invalidateQueries({ queryKey: ['orders', id] })
    },
  })

  if (orderQuery.isLoading) {
    return (
      <section className="mx-auto w-full max-w-6xl px-5 py-16">
        <Spinner />
      </section>
    )
  }
  if (!order) {
    return (
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-16">
        <Typography variant="h1">Заказ не найден</Typography>
        <Button asChild className="w-fit">
          <Link to="/orders">К списку</Link>
        </Button>
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
      <div className="flex items-center justify-between">
        <div className="grid gap-1">
          <Typography variant="h1">Заказ</Typography>
          <Typography tone="muted">
            <Badge variant={order.mode === 'ORDER' ? 'default' : 'outline'}>
              {order.mode === 'ORDER' ? 'Заказ' : 'Тест'}
            </Badge>{' '}
            · {new Date(order.createdAt).toLocaleString('ru-RU')}
          </Typography>
        </div>
        <Button asChild variant="outline">
          <Link to="/orders">К списку</Link>
        </Button>
      </div>

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
                  <TableCell>{f.fabricName}</TableCell>
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
                    <TableCell>{f.fabricName}</TableCell>
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
          {addFactMutation.isError && (
            <Alert variant="destructive">
              <AlertTitle>Ошибка</AlertTitle>
              <AlertDescription>{errMessage(addFactMutation.error)}</AlertDescription>
            </Alert>
          )}
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
                    <TableCell>{order.result.fabrics.find((rf) => rf.fabricId === f.fabricId)?.fabricName ?? f.fabricId}</TableCell>
                    <TableCell>{fmt(f.actualConsumed)}</TableCell>
                    <TableCell>{f.plannedKg === null ? '—' : fmt(f.plannedKg)}</TableCell>
                    <TableCell>
                      {f.deviation === null ? (
                        '—'
                      ) : (
                        <Badge variant={f.deviation > 0 ? 'destructive' : 'default'}>
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
