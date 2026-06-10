import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type {
  FabricDto,
  FabricInput,
  PassportInput,
  SkuDto,
  SupplierDto,
  SupplierFabricInput,
} from '@web-app-demo/contracts'
import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { ApiRequestError } from '@/lib/api'
import { formatFabricLabel } from '@/lib/fabric'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

const SIZE_LADDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const ROLE_OPTIONS = ['MAIN', 'RIB', 'TRIM', 'OTHER'] as const

function errMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Неизвестная ошибка'
}

const subNavLinkClass = cn(
  buttonVariants({ variant: 'ghost', size: 'sm' }),
  'text-muted-foreground data-[status=active]:bg-secondary data-[status=active]:text-secondary-foreground data-[status=active]:hover:bg-secondary/80 data-[status=active]:hover:text-secondary-foreground'
)

function AdminLayout({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10">
      <div className="grid gap-2">
        <Badge variant="outline" className="w-fit">
          Справочники
        </Badge>
        <Typography variant="h1">{title}</Typography>
        <Typography tone="muted">{description}</Typography>
        <nav className="mt-2 flex flex-wrap items-center gap-2" aria-label="Admin">
          <Link to="/admin/fabrics" className={subNavLinkClass}>
            Ткани
          </Link>
          <Link to="/admin/suppliers" className={subNavLinkClass}>
            Поставщики
          </Link>
          <Link to="/admin/skus" className={subNavLinkClass}>
            SKU
          </Link>
        </nav>
      </div>
      {children}
    </section>
  )
}

function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <Alert variant="destructive">
      <AlertTitle>Ошибка</AlertTitle>
      <AlertDescription>{errMessage(error)}</AlertDescription>
    </Alert>
  )
}

// ---------------- Fabrics ----------------

type FabricForm = {
  code: string
  name: string
  category: string
  composition: string
  canonicalUnit: 'kg' | 'm'
  densityGsm: string
  widthCm: string
  isDefaultWidth: boolean
  preShrinkPct: string
  isDefaultShrink: boolean
  rollSize: string
  rollUnit: 'kg' | 'm'
}

const emptyFabricForm: FabricForm = {
  code: '',
  name: '',
  category: '',
  composition: '',
  canonicalUnit: 'kg',
  densityGsm: '',
  widthCm: '',
  isDefaultWidth: false,
  preShrinkPct: '',
  isDefaultShrink: false,
  rollSize: '',
  rollUnit: 'kg',
}

function fabricToForm(f: FabricDto): FabricForm {
  return {
    code: f.code,
    name: f.name,
    category: f.category,
    composition: f.composition ?? '',
    canonicalUnit: f.canonicalUnit,
    densityGsm: String(f.densityGsm),
    widthCm: String(f.widthCm),
    isDefaultWidth: f.isDefaultWidth,
    preShrinkPct: String(Math.round(f.preShrink * 1000) / 10),
    isDefaultShrink: f.isDefaultShrink,
    rollSize: String(f.rollSize),
    rollUnit: f.rollUnit,
  }
}

function formToFabricInput(form: FabricForm): FabricInput {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    category: form.category.trim(),
    composition: form.composition.trim() ? form.composition.trim() : null,
    canonicalUnit: form.canonicalUnit,
    densityGsm: Math.round(Number(form.densityGsm)),
    widthCm: Math.round(Number(form.widthCm)),
    isDefaultWidth: form.isDefaultWidth,
    preShrink: Number(form.preShrinkPct) / 100,
    isDefaultShrink: form.isDefaultShrink,
    rollSize: Number(form.rollSize),
    rollUnit: form.rollUnit,
  }
}

function FabricFormFields({ form, setForm }: { form: FabricForm; setForm: (f: FabricForm) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field>
        <FieldLabel>Код</FieldLabel>
        <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Название</FieldLabel>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Категория</FieldLabel>
        <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Состав</FieldLabel>
        <Input value={form.composition} onChange={(e) => setForm({ ...form, composition: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Плотность, г/м²</FieldLabel>
        <Input type="number" min={1} value={form.densityGsm} onChange={(e) => setForm({ ...form, densityGsm: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Ширина, см</FieldLabel>
        <Input type="number" min={1} value={form.widthCm} onChange={(e) => setForm({ ...form, widthCm: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Усадка, %</FieldLabel>
        <Input type="number" min={0} max={100} value={form.preShrinkPct} onChange={(e) => setForm({ ...form, preShrinkPct: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Рулон</FieldLabel>
        <Input type="number" min={0} value={form.rollSize} onChange={(e) => setForm({ ...form, rollSize: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Канон. ед.</FieldLabel>
        <NativeSelect value={form.canonicalUnit} onChange={(e) => setForm({ ...form, canonicalUnit: e.target.value as 'kg' | 'm' })}>
          <NativeSelectOption value="kg">кг</NativeSelectOption>
          <NativeSelectOption value="m">м</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>Ед. рулона</FieldLabel>
        <NativeSelect value={form.rollUnit} onChange={(e) => setForm({ ...form, rollUnit: e.target.value as 'kg' | 'm' })}>
          <NativeSelectOption value="kg">кг</NativeSelectOption>
          <NativeSelectOption value="m">м</NativeSelectOption>
        </NativeSelect>
      </Field>
      <label className="flex items-center gap-2 self-end pb-2">
        <Checkbox checked={form.isDefaultWidth} onCheckedChange={(v) => setForm({ ...form, isDefaultWidth: v === true })} />
        <Typography variant="control" tone="muted">
          Ширина по умолчанию
        </Typography>
      </label>
      <label className="flex items-center gap-2 self-end pb-2">
        <Checkbox checked={form.isDefaultShrink} onCheckedChange={(v) => setForm({ ...form, isDefaultShrink: v === true })} />
        <Typography variant="control" tone="muted">
          Усадка по умолчанию
        </Typography>
      </label>
    </div>
  )
}

export function FabricsAdminPage() {
  const { api } = useAuth()
  const queryClient = useQueryClient()
  const fabricsQuery = useQuery({ queryKey: ['fabrics'], queryFn: () => api.listFabrics() })
  const fabrics = fabricsQuery.data ?? []

  const [createForm, setCreateForm] = useState<FabricForm>(emptyFabricForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FabricForm>(emptyFabricForm)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fabrics'] })

  const createMutation = useMutation({
    mutationFn: () => api.createFabric(formToFabricInput(createForm)),
    onSuccess: () => {
      setCreateForm(emptyFabricForm)
      void invalidate()
    },
  })
  const updateMutation = useMutation({
    mutationFn: (id: string) => api.updateFabric(id, formToFabricInput(editForm)),
    onSuccess: () => {
      setEditId(null)
      void invalidate()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteFabric(id),
    onSuccess: () => void invalidate(),
  })

  function startEdit(f: FabricDto) {
    setEditId(f.id)
    setEditForm(fabricToForm(f))
    updateMutation.reset()
  }

  function onDelete(f: FabricDto) {
    if (window.confirm(`Удалить ткань «${f.name}»?`)) deleteMutation.mutate(f.id)
  }

  return (
    <AdminLayout title="Ткани" description="Справочник тканей: характеристики, плотность, усадка и рулоны.">
      <Card>
        <CardHeader>
          <CardTitle>Список тканей</CardTitle>
          <CardDescription>{fabrics.length} шт.</CardDescription>
        </CardHeader>
        <CardContent>
          {fabricsQuery.isLoading ? (
            <Spinner />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Код</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Состав</TableHead>
                  <TableHead>Плотность, г/м²</TableHead>
                  <TableHead>Ширина, см</TableHead>
                  <TableHead>Усадка, %</TableHead>
                  <TableHead>Рулон</TableHead>
                  <TableHead>Канон. ед.</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fabrics.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.code}</TableCell>
                    <TableCell>{f.name}</TableCell>
                    <TableCell>{f.category}</TableCell>
                    <TableCell>{f.composition ?? '—'}</TableCell>
                    <TableCell>{f.densityGsm}</TableCell>
                    <TableCell>
                      {f.isDefaultWidth ? '≈ ' : ''}
                      {f.widthCm}
                    </TableCell>
                    <TableCell>
                      {f.isDefaultShrink ? '≈ ' : ''}
                      {Math.round(f.preShrink * 1000) / 10}
                    </TableCell>
                    <TableCell>
                      {f.rollSize} {f.rollUnit}
                    </TableCell>
                    <TableCell>{f.canonicalUnit}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(f)}>
                          Изменить
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(f)} disabled={deleteMutation.isPending}>
                          Удалить
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {deleteMutation.isError && (
            <div className="pt-4">
              <ErrorAlert error={deleteMutation.error} />
            </div>
          )}
        </CardContent>
      </Card>

      {editId && (
        <Card>
          <CardHeader>
            <CardTitle>Редактирование ткани</CardTitle>
            <CardDescription>Усадка вводится в процентах (например, 6 = 6%).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FabricFormFields form={editForm} setForm={setEditForm} />
            <div className="flex gap-2">
              <Button type="button" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate(editId)}>
                {updateMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditId(null)}>
                Отмена
              </Button>
            </div>
            <ErrorAlert error={updateMutation.error} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Добавить ткань</CardTitle>
          <CardDescription>Усадка вводится в процентах (например, 6 = 6%).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FabricFormFields form={createForm} setForm={setCreateForm} />
          <div>
            <Button type="button" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Добавляем…' : 'Добавить ткань'}
            </Button>
          </div>
          <ErrorAlert error={createMutation.error} />
        </CardContent>
      </Card>
    </AdminLayout>
  )
}

// ---------------- Suppliers ----------------

type SupplierForm = {
  code: string
  name: string
  country: string
  leadTimeDays: string
}

const emptySupplierForm: SupplierForm = { code: '', name: '', country: '', leadTimeDays: '' }

function supplierToForm(s: SupplierDto): SupplierForm {
  return {
    code: s.code,
    name: s.name,
    country: s.country ?? '',
    leadTimeDays: s.leadTimeDays === null ? '' : String(s.leadTimeDays),
  }
}

function formToSupplierInput(form: SupplierForm) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    country: form.country.trim() ? form.country.trim() : null,
    leadTimeDays: form.leadTimeDays.trim() ? Math.round(Number(form.leadTimeDays)) : null,
  }
}

function SupplierFormFields({ form, setForm }: { form: SupplierForm; setForm: (f: SupplierForm) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field>
        <FieldLabel>Код</FieldLabel>
        <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Название</FieldLabel>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Страна</FieldLabel>
        <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Срок, дней</FieldLabel>
        <Input type="number" min={0} value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} />
      </Field>
    </div>
  )
}

export function SuppliersAdminPage() {
  const { api } = useAuth()
  const queryClient = useQueryClient()
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: () => api.listSuppliers() })
  const fabricsQuery = useQuery({ queryKey: ['fabrics'], queryFn: () => api.listFabrics() })
  const sfQuery = useQuery({ queryKey: ['supplier-fabrics'], queryFn: () => api.listSupplierFabrics() })

  const suppliers = suppliersQuery.data ?? []
  const fabrics = fabricsQuery.data ?? []
  const supplierFabrics = sfQuery.data ?? []
  const fabricById = new Map(fabrics.map((f) => [f.id, f]))

  const [createForm, setCreateForm] = useState<SupplierForm>(emptySupplierForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<SupplierForm>(emptySupplierForm)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [edgeFabricId, setEdgeFabricId] = useState('')
  const [edgePriceRub, setEdgePriceRub] = useState('')
  const [edgePriceUsd, setEdgePriceUsd] = useState('')

  const invalidateSuppliers = () => queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  const invalidateEdges = () => queryClient.invalidateQueries({ queryKey: ['supplier-fabrics'] })

  const createMutation = useMutation({
    mutationFn: () => api.createSupplier(formToSupplierInput(createForm)),
    onSuccess: () => {
      setCreateForm(emptySupplierForm)
      void invalidateSuppliers()
    },
  })
  const updateMutation = useMutation({
    mutationFn: (id: string) => api.updateSupplier(id, formToSupplierInput(editForm)),
    onSuccess: () => {
      setEditId(null)
      void invalidateSuppliers()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSupplier(id),
    onSuccess: () => void invalidateSuppliers(),
  })

  const addEdgeMutation = useMutation({
    mutationFn: () => {
      const input: SupplierFabricInput = {
        supplierId: selectedId ?? '',
        fabricId: edgeFabricId,
        priceRub: edgePriceRub.trim() ? Number(edgePriceRub) : null,
        priceUsd: edgePriceUsd.trim() ? Number(edgePriceUsd) : null,
      }
      return api.upsertSupplierFabric(input)
    },
    onSuccess: () => {
      setEdgeFabricId('')
      setEdgePriceRub('')
      setEdgePriceUsd('')
      void invalidateEdges()
    },
  })
  const deleteEdgeMutation = useMutation({
    mutationFn: (id: string) => api.deleteSupplierFabric(id),
    onSuccess: () => void invalidateEdges(),
  })

  function startEdit(s: SupplierDto) {
    setEditId(s.id)
    setEditForm(supplierToForm(s))
    updateMutation.reset()
  }

  function onDelete(s: SupplierDto) {
    if (window.confirm(`Удалить поставщика «${s.name}»?`)) deleteMutation.mutate(s.id)
  }

  const selectedSupplier = suppliers.find((s) => s.id === selectedId) ?? null
  const selectedEdges = supplierFabrics.filter((sf) => sf.supplierId === selectedId)

  return (
    <AdminLayout title="Поставщики" description="Поставщики и их цены на ткани.">
      <Card>
        <CardHeader>
          <CardTitle>Список поставщиков</CardTitle>
          <CardDescription>{suppliers.length} шт.</CardDescription>
        </CardHeader>
        <CardContent>
          {suppliersQuery.isLoading ? (
            <Spinner />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Код</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Страна</TableHead>
                  <TableHead>Срок</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.country ?? '—'}</TableCell>
                    <TableCell>{s.leadTimeDays === null ? '—' : `${s.leadTimeDays} дн.`}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant={selectedId === s.id ? 'secondary' : 'ghost'} onClick={() => setSelectedId(s.id)}>
                          Цены
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(s)}>
                          Изменить
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(s)} disabled={deleteMutation.isPending}>
                          Удалить
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {deleteMutation.isError && (
            <div className="pt-4">
              <ErrorAlert error={deleteMutation.error} />
            </div>
          )}
        </CardContent>
      </Card>

      {editId && (
        <Card>
          <CardHeader>
            <CardTitle>Редактирование поставщика</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SupplierFormFields form={editForm} setForm={setEditForm} />
            <div className="flex gap-2">
              <Button type="button" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate(editId)}>
                {updateMutation.isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditId(null)}>
                Отмена
              </Button>
            </div>
            <ErrorAlert error={updateMutation.error} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Добавить поставщика</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SupplierFormFields form={createForm} setForm={setCreateForm} />
          <div>
            <Button type="button" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Добавляем…' : 'Добавить поставщика'}
            </Button>
          </div>
          <ErrorAlert error={createMutation.error} />
        </CardContent>
      </Card>

      {selectedSupplier && (
        <Card>
          <CardHeader>
            <CardTitle>Цены поставщика: {selectedSupplier.name}</CardTitle>
            <CardDescription>Связи ткань → цена. Сохранение перезаписывает существующую цену.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ткань</TableHead>
                  <TableHead>Цена, ₽</TableHead>
                  <TableHead>Цена, $</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedEdges.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="bodySm" tone="muted">
                        Цены не заданы.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedEdges.map((sf) => (
                    <TableRow key={sf.id}>
                      <TableCell>{formatFabricLabel(fabricById.get(sf.fabricId)) ?? sf.fabricId}</TableCell>
                      <TableCell>{sf.priceRub ?? '—'}</TableCell>
                      <TableCell>{sf.priceUsd ?? '—'}</TableCell>
                      <TableCell>
                        <Button type="button" size="sm" variant="ghost" onClick={() => deleteEdgeMutation.mutate(sf.id)} disabled={deleteEdgeMutation.isPending}>
                          Удалить
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field>
                <FieldLabel>Ткань</FieldLabel>
                <NativeSelect value={edgeFabricId} onChange={(e) => setEdgeFabricId(e.target.value)}>
                  <NativeSelectOption value="">— выберите ткань —</NativeSelectOption>
                  {fabrics.map((f) => (
                    <NativeSelectOption key={f.id} value={f.id}>
                      {f.code} · {formatFabricLabel(f)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Цена, ₽</FieldLabel>
                <Input type="number" min={0} value={edgePriceRub} onChange={(e) => setEdgePriceRub(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Цена, $</FieldLabel>
                <Input type="number" min={0} value={edgePriceUsd} onChange={(e) => setEdgePriceUsd(e.target.value)} />
              </Field>
              <div className="flex items-end pb-2">
                <Button type="button" disabled={!edgeFabricId || addEdgeMutation.isPending} onClick={() => addEdgeMutation.mutate()}>
                  {addEdgeMutation.isPending ? 'Сохраняем…' : 'Добавить цену'}
                </Button>
              </div>
            </div>
            <ErrorAlert error={addEdgeMutation.error ?? deleteEdgeMutation.error} />
          </CardContent>
        </Card>
      )}
    </AdminLayout>
  )
}

// ---------------- SKUs + passport ----------------

type SkuForm = { code: string; name: string; category: string; fit: string }
const emptySkuForm: SkuForm = { code: '', name: '', category: '', fit: '' }

function formToSkuInput(form: SkuForm) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    category: form.category.trim(),
    fit: form.fit.trim() ? form.fit.trim() : null,
  }
}

type ComponentForm = {
  role: (typeof ROLE_OPTIONS)[number]
  normBase: string
  lossCutPct: string
  lossSewPct: string
  allowedFabricIds: string[]
}

function emptyComponent(): ComponentForm {
  return { role: 'MAIN', normBase: '', lossCutPct: '', lossSewPct: '', allowedFabricIds: [] }
}

type SizeCoef = { size: string; coef: string }

export function SkusAdminPage() {
  const { api } = useAuth()
  const queryClient = useQueryClient()
  const skusQuery = useQuery({ queryKey: ['skus'], queryFn: () => api.listSkus() })
  const fabricsQuery = useQuery({ queryKey: ['fabrics'], queryFn: () => api.listFabrics() })

  const skus = skusQuery.data ?? []
  const fabrics = fabricsQuery.data ?? []

  const [createForm, setCreateForm] = useState<SkuForm>(emptySkuForm)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [baseSize, setBaseSize] = useState('M')
  const [sizeCoefs, setSizeCoefs] = useState<SizeCoef[]>([])
  const [components, setComponents] = useState<ComponentForm[]>([])

  const invalidateSkus = () => queryClient.invalidateQueries({ queryKey: ['skus'] })

  const createMutation = useMutation({
    mutationFn: () => api.createSku(formToSkuInput(createForm)),
    onSuccess: () => {
      setCreateForm(emptySkuForm)
      void invalidateSkus()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSku(id),
    onSuccess: () => {
      setSelectedId(null)
      void invalidateSkus()
    },
  })
  const savePassportMutation = useMutation({
    mutationFn: (skuId: string) => {
      const sizeCoefficients: Record<string, number> = {}
      for (const row of sizeCoefs) {
        const size = row.size.trim()
        if (size) sizeCoefficients[size] = Number(row.coef)
      }
      const input: PassportInput = {
        baseSize: baseSize.trim() || 'M',
        sizeCoefficients,
        components: components.map((c) => ({
          role: c.role,
          normBase: Number(c.normBase),
          lossCut: Number(c.lossCutPct) / 100,
          lossSew: Number(c.lossSewPct) / 100,
          allowedFabricIds: c.allowedFabricIds,
        })),
      }
      return api.upsertPassport(skuId, input)
    },
    onSuccess: () => void invalidateSkus(),
  })

  function selectSku(sku: SkuDto) {
    setSelectedId(sku.id)
    savePassportMutation.reset()
    const p = sku.passport
    if (p) {
      setBaseSize(p.baseSize)
      setSizeCoefs(
        Object.entries(p.sizeCoefficients).map(([size, coef]) => ({ size, coef: String(coef) })),
      )
      setComponents(
        p.components.map((c) => ({
          role: c.role,
          normBase: String(c.normBase),
          lossCutPct: String(Math.round(c.lossCut * 1000) / 10),
          lossSewPct: String(Math.round(c.lossSew * 1000) / 10),
          allowedFabricIds: c.allowedFabricIds,
        })),
      )
    } else {
      setBaseSize('M')
      setSizeCoefs(SIZE_LADDER.map((size) => ({ size, coef: size === 'M' ? '1' : '' })))
      setComponents([emptyComponent()])
    }
  }

  function onDeleteSku(sku: SkuDto) {
    if (window.confirm(`Удалить SKU «${sku.name}»?`)) deleteMutation.mutate(sku.id)
  }

  function toggleFabric(idx: number, fabricId: string, on: boolean) {
    setComponents((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c
        const next = on ? [...c.allowedFabricIds, fabricId] : c.allowedFabricIds.filter((id) => id !== fabricId)
        return { ...c, allowedFabricIds: next }
      }),
    )
  }

  function updateComponent(idx: number, patch: Partial<ComponentForm>) {
    setComponents((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  const selectedSku = skus.find((s) => s.id === selectedId) ?? null

  return (
    <AdminLayout title="SKU" description="Модели изделий и их паспорта (нормы, размерный ряд, ткани).">
      <Card>
        <CardHeader>
          <CardTitle>Список SKU</CardTitle>
          <CardDescription>{skus.length} шт.</CardDescription>
        </CardHeader>
        <CardContent>
          {skusQuery.isLoading ? (
            <Spinner />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Код</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Крой</TableHead>
                  <TableHead>Паспорт</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {skus.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.category}</TableCell>
                    <TableCell>{s.fit ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={s.passport ? 'default' : 'outline'}>{s.passport ? 'да' : 'нет'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant={selectedId === s.id ? 'secondary' : 'ghost'} onClick={() => selectSku(s)}>
                          Паспорт
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => onDeleteSku(s)} disabled={deleteMutation.isPending}>
                          Удалить
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {deleteMutation.isError && (
            <div className="pt-4">
              <ErrorAlert error={deleteMutation.error} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Добавить SKU</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel>Код</FieldLabel>
              <Input value={createForm.code} onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>Название</FieldLabel>
              <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>Категория</FieldLabel>
              <Input value={createForm.category} onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>Крой</FieldLabel>
              <Input value={createForm.fit} onChange={(e) => setCreateForm({ ...createForm, fit: e.target.value })} />
            </Field>
          </div>
          <div>
            <Button type="button" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Добавляем…' : 'Добавить SKU'}
            </Button>
          </div>
          <ErrorAlert error={createMutation.error} />
        </CardContent>
      </Card>

      {selectedSku && (
        <Card>
          <CardHeader>
            <CardTitle>Паспорт: {selectedSku.name}</CardTitle>
            <CardDescription>Базовый размер, коэффициенты размеров и компоненты. Потери вводятся в %.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field>
                <FieldLabel>Базовый размер</FieldLabel>
                <Input value={baseSize} onChange={(e) => setBaseSize(e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-3">
              <Typography variant="control" tone="muted">
                Коэффициенты размеров
              </Typography>
              <div className="grid gap-2">
                {sizeCoefs.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap items-end gap-2">
                    <Field className="w-28">
                      <FieldLabel>Размер</FieldLabel>
                      <Input
                        value={row.size}
                        onChange={(e) =>
                          setSizeCoefs((prev) => prev.map((r, i) => (i === idx ? { ...r, size: e.target.value } : r)))
                        }
                      />
                    </Field>
                    <Field className="w-32">
                      <FieldLabel>Коэф.</FieldLabel>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.coef}
                        onChange={(e) =>
                          setSizeCoefs((prev) => prev.map((r, i) => (i === idx ? { ...r, coef: e.target.value } : r)))
                        }
                      />
                    </Field>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mb-2"
                      onClick={() => setSizeCoefs((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Удалить
                    </Button>
                  </div>
                ))}
              </div>
              <div>
                <Button type="button" size="sm" variant="outline" onClick={() => setSizeCoefs((prev) => [...prev, { size: '', coef: '' }])}>
                  + Размер
                </Button>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4">
              <Typography variant="control" tone="muted">
                Компоненты
              </Typography>
              {components.map((c, idx) => (
                <div key={idx} className="grid gap-4 rounded-md border p-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field>
                      <FieldLabel>Роль</FieldLabel>
                      <NativeSelect value={c.role} onChange={(e) => updateComponent(idx, { role: e.target.value as ComponentForm['role'] })}>
                        {ROLE_OPTIONS.map((r) => (
                          <NativeSelectOption key={r} value={r}>
                            {r}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel>Норма (база)</FieldLabel>
                      <Input type="number" min={0} step="0.001" value={c.normBase} onChange={(e) => updateComponent(idx, { normBase: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel>Потери крой, %</FieldLabel>
                      <Input type="number" min={0} max={100} value={c.lossCutPct} onChange={(e) => updateComponent(idx, { lossCutPct: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel>Потери пошив, %</FieldLabel>
                      <Input type="number" min={0} max={100} value={c.lossSewPct} onChange={(e) => updateComponent(idx, { lossSewPct: e.target.value })} />
                    </Field>
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel>Допустимые ткани</FieldLabel>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {fabrics.map((f) => (
                        <label key={f.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={c.allowedFabricIds.includes(f.id)}
                            onCheckedChange={(v) => toggleFabric(idx, f.id, v === true)}
                          />
                          <Typography variant="bodySm">
                            {f.code} · {formatFabricLabel(f)}
                          </Typography>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setComponents((prev) => prev.filter((_, i) => i !== idx))}>
                      Удалить компонент
                    </Button>
                  </div>
                </div>
              ))}
              <div>
                <Button type="button" size="sm" variant="outline" onClick={() => setComponents((prev) => [...prev, emptyComponent()])}>
                  + Компонент
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" disabled={savePassportMutation.isPending} onClick={() => savePassportMutation.mutate(selectedSku.id)}>
                {savePassportMutation.isPending ? 'Сохраняем…' : 'Сохранить паспорт'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSelectedId(null)}>
                Закрыть
              </Button>
            </div>
            <ErrorAlert error={savePassportMutation.error} />
          </CardContent>
        </Card>
      )}
    </AdminLayout>
  )
}
