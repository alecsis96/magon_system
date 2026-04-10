import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "react-hot-toast"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import {
  formatDateKey,
  formatMonthKey,
  getTodayDateKey,
  toDateKey,
} from "../lib/datetime"
import { supabase } from "../lib/supabase"
import type {
  CierreCaja,
  CierreCajaInsert,
  Egreso,
  EgresoInsert,
  EgresoPlantilla,
  EgresoPlantillaInsert,
  EgresoPlantillaUpdate,
  MedioSalida,
  Pedido,
} from "../types/database"

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

const DEFAULT_ACCESS: AdminAccess = {
  isAuthenticated: false,
  isAdmin: false,
  email: null,
}

const EXPENSE_CATEGORIES = [
  "Proveedor",
  "Nomina",
  "Servicios",
  "Transporte",
  "Mantenimiento",
  "Insumos",
  "Otros",
] as const

const MEDIO_OPTIONS: { label: string; value: MedioSalida }[] = [
  { label: "Efectivo", value: "efectivo" },
  { label: "Transferencia", value: "transferencia" },
]

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5] as const

const TAB_OPTIONS: { key: DashboardTab; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "captura", label: "Captura" },
  { key: "egresos", label: "Egresos" },
  { key: "arqueo", label: "Arqueo" },
  { key: "periodos", label: "Periodos" },
  { key: "plantillas", label: "Plantillas" },
]

type ExpenseFormState = {
  fecha: string
  categoria: string
  medio_salida: MedioSalida
  concepto: string
  monto: string
}

type TemplateFormState = {
  nombre: string
  categoria: string
  concepto_base: string
  monto_sugerido: string
  medio_salida: MedioSalida
}

type PeriodMode = "dia" | "semana" | "mes"

type DashboardTab =
  | "hoy"
  | "captura"
  | "egresos"
  | "arqueo"
  | "periodos"
  | "plantillas"

type PeriodRow = {
  key: string
  label: string
  cobrado: number
  pendiente: number
  egresos: number
  neto: number
}

type DenominationCounts = Record<string, number>

function toMoneyNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function getTodayLocalISODate() {
  return getTodayDateKey()
}

function toLocalDateKey(value: string | null) {
  if (!value) {
    return ""
  }

  return toDateKey(value)
}

function formatDateLabel(value: string) {
  return formatDateKey(value)
}

function formatDateRangeLabel(start: string, end: string) {
  const startLabel = formatDateLabel(start)
  const endLabel = formatDateLabel(end)
  return `${startLabel} - ${endLabel}`
}

function getMonthLabel(value: string) {
  return formatMonthKey(value)
}

function getISOWeekBounds(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
  const dayOfWeek = date.getUTCDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() + diffToMonday)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  const mondayKey = monday.toISOString().slice(0, 10)
  const sundayKey = sunday.toISOString().slice(0, 10)
  const isoYear = monday.getUTCFullYear()

  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  const firstDayOfWeek = firstThursday.getUTCDay() || 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() + (1 - firstDayOfWeek))

  const weekNumber =
    Math.ceil((monday.getTime() - firstThursday.getTime()) / 604800000) + 1

  return {
    key: `${isoYear}-W${String(weekNumber).padStart(2, "0")}`,
    monday: mondayKey,
    sunday: sundayKey,
  }
}

function getDefaultDenominationCounts() {
  const initial: DenominationCounts = {}
  for (const denomination of DENOMINATIONS) {
    initial[String(denomination)] = 0
  }
  return initial
}

function normalizeDenominationCounts(source: unknown) {
  const result = getDefaultDenominationCounts()
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return result
  }

  const json = source as Record<string, unknown>
  for (const denomination of DENOMINATIONS) {
    const key = String(denomination)
    const value = Number(json[key])
    result[key] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
  }

  return result
}

function sumDenominations(counts: DenominationCounts) {
  return DENOMINATIONS.reduce((sum, denomination) => {
    const count = Number(counts[String(denomination)] ?? 0)
    return sum + denomination * (Number.isFinite(count) ? count : 0)
  }, 0)
}

function sumDenominationsByType(counts: DenominationCounts) {
  return DENOMINATIONS.reduce(
    (acc, denomination) => {
      const count = Number(counts[String(denomination)] ?? 0)
      const amount = denomination * (Number.isFinite(count) ? count : 0)

      if (denomination >= 20) {
        acc.billetes += amount
      } else {
        acc.monedas += amount
      }

      return acc
    },
    { billetes: 0, monedas: 0 },
  )
}

function isMonthKey(value: string) {
  return /^\d{4}-\d{2}$/.test(value)
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isEffectivelyPaid(order: Pedido) {
  return (
    order.estado_pago === "pagado" ||
    order.estado === "entregado" ||
    order.tipo_pedido === "mostrador"
  )
}

export function AccountingDashboard() {
  const [adminAccess, setAdminAccess] = useState<AdminAccess>(DEFAULT_ACCESS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingExpense, setIsSavingExpense] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [isSavingArqueo, setIsSavingArqueo] = useState(false)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [egresos, setEgresos] = useState<Egreso[]>([])
  const [plantillas, setPlantillas] = useState<EgresoPlantilla[]>([])
  const [selectedDate, setSelectedDate] = useState(getTodayLocalISODate())
  const [cierreSeleccionado, setCierreSeleccionado] = useState<CierreCaja | null>(null)
  const [periodMode, setPeriodMode] = useState<PeriodMode>("dia")
  const [showCanceled, setShowCanceled] = useState(false)
  const [activeTab, setActiveTab] = useState<DashboardTab>("hoy")
  const [captureTemplateId, setCaptureTemplateId] = useState("")
  const [showMoreExpenses, setShowMoreExpenses] = useState(false)
  const [showMorePeriods, setShowMorePeriods] = useState(false)
  const [showDenominationDetail, setShowDenominationDetail] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<TemplateFormState | null>(null)
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>({
    fecha: getTodayLocalISODate(),
    categoria: "Proveedor",
    medio_salida: "efectivo",
    concepto: "",
    monto: "",
  })
  const [templateForm, setTemplateForm] = useState<TemplateFormState>({
    nombre: "",
    categoria: "Proveedor",
    concepto_base: "",
    monto_sugerido: "",
    medio_salida: "efectivo",
  })
  const [fondoInicial, setFondoInicial] = useState("0")
  const [totalBilletes, setTotalBilletes] = useState("0")
  const [totalMonedas, setTotalMonedas] = useState("0")
  const [arqueoNotas, setArqueoNotas] = useState("")
  const [denominationCounts, setDenominationCounts] = useState<DenominationCounts>(
    getDefaultDenominationCounts(),
  )

  const todayKey = getTodayLocalISODate()
  const yesterdayKey = useMemo(() => {
    const [year, month, day] = todayKey.split("-").map(Number)
    const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
    date.setUTCDate(date.getUTCDate() - 1)
    return date.toISOString().slice(0, 10)
  }, [todayKey])
  const dataStartDate = useMemo(() => {
    const now = new Date()
    const threeMonthsStart = new Date(now.getFullYear(), now.getMonth() - 3, 1)
      .toISOString()
      .slice(0, 10)
    return selectedDate < threeMonthsStart ? selectedDate : threeMonthsStart
  }, [selectedDate])
  const dataEndDate = useMemo(() => {
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return end.toISOString().slice(0, 10)
  }, [])

  const loadAdminState = useCallback(async () => {
    try {
      const access = await getAdminAccess()
      setAdminAccess(access)
      return access
    } catch (error) {
      console.error("Error al validar acceso admin:", error)
      setAdminAccess(DEFAULT_ACCESS)
      return DEFAULT_ACCESS
    }
  }, [])

  const loadAccountingData = useCallback(async () => {
    try {
      setIsLoading(true)
      const access = await loadAdminState()

      if (!access.isAdmin) {
        setPedidos([])
        setEgresos([])
        setPlantillas([])
        setCierreSeleccionado(null)
        return
      }

      const [
        { data: pedidosData, error: pedidosError },
        { data: egresosData, error: egresosError },
        { data: plantillasData, error: plantillasError },
        { data: cierreData, error: cierreError },
      ] = await Promise.all([
        supabase
          .from("pedidos")
          .select("*")
          .gte("fecha_creacion", `${dataStartDate}T00:00:00.000Z`)
          .lt("fecha_creacion", `${dataEndDate}T00:00:00.000Z`)
          .order("fecha_creacion", { ascending: false }),
        supabase
          .from("egresos")
          .select("*")
          .gte("fecha", dataStartDate)
          .lt("fecha", dataEndDate)
          .order("fecha", { ascending: false })
          .order("creado_en", { ascending: false }),
        supabase
          .from("egreso_plantillas")
          .select("*")
          .order("activo", { ascending: false })
          .order("orden", { ascending: true })
          .order("creado_en", { ascending: false }),
        supabase
          .from("cierres_caja")
          .select("*")
          .eq("fecha", selectedDate)
          .maybeSingle(),
      ])

      if (pedidosError) {
        throw pedidosError
      }
      if (egresosError) {
        throw egresosError
      }
      if (plantillasError) {
        throw plantillasError
      }
      if (cierreError) {
        throw cierreError
      }

      const loadedCierre = (cierreData ?? null) as CierreCaja | null

      setPedidos((pedidosData ?? []) as Pedido[])
      setEgresos((egresosData ?? []) as Egreso[])
      setPlantillas((plantillasData ?? []) as EgresoPlantilla[])
      setCierreSeleccionado(loadedCierre)

      if (loadedCierre) {
        const normalizedCounts = normalizeDenominationCounts(
          loadedCierre.conteo_denominaciones,
        )
        const referenceSplit = sumDenominationsByType(normalizedCounts)
        const conteoRaw =
          loadedCierre.conteo_denominaciones &&
          typeof loadedCierre.conteo_denominaciones === "object" &&
          !Array.isArray(loadedCierre.conteo_denominaciones)
            ? (loadedCierre.conteo_denominaciones as Record<string, unknown>)
            : null

        setFondoInicial(String(loadedCierre.fondo_inicial))
        setTotalBilletes(
          String(
            toMoneyNumber(
              String(conteoRaw?.total_billetes_manual ?? referenceSplit.billetes),
            ),
          ),
        )
        setTotalMonedas(
          String(
            toMoneyNumber(
              String(conteoRaw?.total_monedas_manual ?? referenceSplit.monedas),
            ),
          ),
        )
        setArqueoNotas(loadedCierre.notas ?? "")
        setDenominationCounts(normalizedCounts)
      } else {
        setFondoInicial("0")
        setTotalBilletes("0")
        setTotalMonedas("0")
        setArqueoNotas("")
        setDenominationCounts(getDefaultDenominationCounts())
      }
    } catch (error) {
      console.error("Error al cargar contabilidad:", error)
      toast.error("No se pudo cargar la contabilidad")
    } finally {
      setIsLoading(false)
    }
  }, [dataEndDate, dataStartDate, loadAdminState, selectedDate])

  useEffect(() => {
    void loadAccountingData()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadAccountingData()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [loadAccountingData])

  const egresosNoCancelados = useMemo(
    () => egresos.filter((egreso) => !egreso.cancelado),
    [egresos],
  )

  const pedidosSelectedDate = useMemo(
    () => pedidos.filter((pedido) => toLocalDateKey(pedido.fecha_creacion) === selectedDate),
    [pedidos, selectedDate],
  )

  const egresosSelectedDateNoCancelados = useMemo(
    () => egresosNoCancelados.filter((egreso) => egreso.fecha === selectedDate),
    [egresosNoCancelados, selectedDate],
  )

  const kpisSelectedDate = useMemo(() => {
    const cobrado = pedidosSelectedDate.reduce(
      (sum, pedido) => sum + (isEffectivelyPaid(pedido) ? pedido.total : 0),
      0,
    )
    const pendiente = pedidosSelectedDate.reduce(
      (sum, pedido) => sum + (!isEffectivelyPaid(pedido) ? pedido.total : 0),
      0,
    )
    const egresosTotal = egresosSelectedDateNoCancelados.reduce(
      (sum, egreso) => sum + egreso.monto,
      0,
    )
    return {
      cobrado,
      pendiente,
      egresos: egresosTotal,
      neto: cobrado - egresosTotal,
    }
  }, [egresosSelectedDateNoCancelados, pedidosSelectedDate])

  const efectivoCobradoSelectedDate = useMemo(
    () =>
      pedidosSelectedDate.reduce(
        (sum, pedido) =>
          sum +
          (isEffectivelyPaid(pedido) && pedido.metodo_pago === "efectivo"
            ? pedido.total
            : 0),
        0,
      ),
    [pedidosSelectedDate],
  )

  const transferenciaCobradaSelectedDate = useMemo(
    () =>
      pedidosSelectedDate.reduce(
        (sum, pedido) =>
          sum +
          (isEffectivelyPaid(pedido) &&
          pedido.metodo_pago === "transferencia"
            ? pedido.total
            : 0),
        0,
      ),
    [pedidosSelectedDate],
  )

  const egresosEfectivoSelectedDate = useMemo(
    () =>
      egresosSelectedDateNoCancelados.reduce(
        (sum, egreso) =>
          sum + (egreso.medio_salida === "efectivo" ? egreso.monto : 0),
        0,
      ),
    [egresosSelectedDateNoCancelados],
  )

  const egresosTransferenciaSelectedDate = useMemo(
    () =>
      egresosSelectedDateNoCancelados.reduce(
        (sum, egreso) =>
          sum + (egreso.medio_salida === "transferencia" ? egreso.monto : 0),
        0,
      ),
    [egresosSelectedDateNoCancelados],
  )

  const countedFromDenominations = useMemo(
    () => sumDenominations(denominationCounts),
    [denominationCounts],
  )

  const denominationSplit = useMemo(
    () => sumDenominationsByType(denominationCounts),
    [denominationCounts],
  )

  const countedTotal = useMemo(
    () => toMoneyNumber(totalBilletes) + toMoneyNumber(totalMonedas),
    [totalBilletes, totalMonedas],
  )

  const expectedTotal = useMemo(() => {
    const fondo = Number(fondoInicial)
    const initial = Number.isFinite(fondo) ? fondo : 0
    return initial + efectivoCobradoSelectedDate - egresosEfectivoSelectedDate
  }, [efectivoCobradoSelectedDate, egresosEfectivoSelectedDate, fondoInicial])

  const diferenciaArqueo = countedTotal - expectedTotal

  const periodRows = useMemo(() => {
    const map = new Map<string, PeriodRow>()

    const ensureRow = (key: string, label: string) => {
      const current = map.get(key)
      if (current) {
        return current
      }
      const created: PeriodRow = {
        key,
        label,
        cobrado: 0,
        pendiente: 0,
        egresos: 0,
        neto: 0,
      }
      map.set(key, created)
      return created
    }

    const resolveGrouping = (dateKey: string) => {
      if (periodMode === "dia") {
        return { key: dateKey, label: formatDateLabel(dateKey) }
      }

      if (periodMode === "mes") {
        const monthKey = dateKey.slice(0, 7)
        return { key: monthKey, label: getMonthLabel(monthKey) }
      }

      const week = getISOWeekBounds(dateKey)
      return {
        key: week.key,
        label: formatDateRangeLabel(week.monday, week.sunday),
      }
    }

    for (const pedido of pedidos) {
      const dateKey = toLocalDateKey(pedido.fecha_creacion)
      if (!dateKey) {
        continue
      }
      const group = resolveGrouping(dateKey)
      const row = ensureRow(group.key, group.label)
      if (isEffectivelyPaid(pedido)) {
        row.cobrado += pedido.total
      } else {
        row.pendiente += pedido.total
      }
    }

    for (const egreso of egresosNoCancelados) {
      const group = resolveGrouping(egreso.fecha)
      const row = ensureRow(group.key, group.label)
      row.egresos += egreso.monto
    }

    return Array.from(map.values())
      .map((row) => ({ ...row, neto: row.cobrado - row.egresos }))
      .sort((a, b) => {
        if (isDateKey(a.key) && isDateKey(b.key)) {
          return a.key < b.key ? 1 : -1
        }
        if (isMonthKey(a.key) && isMonthKey(b.key)) {
          return a.key < b.key ? 1 : -1
        }
        return a.key < b.key ? 1 : -1
      })
      .slice(0, 20)
  }, [egresosNoCancelados, pedidos, periodMode])

  const visiblePeriodRows = useMemo(
    () => (showMorePeriods ? periodRows : periodRows.slice(0, 6)),
    [periodRows, showMorePeriods],
  )

  const recentExpenses = useMemo(() => {
    const filtered = showCanceled ? egresos : egresosNoCancelados
    return filtered.slice(0, 12)
  }, [egresos, egresosNoCancelados, showCanceled])

  const visibleExpenses = useMemo(
    () => (showMoreExpenses ? recentExpenses : recentExpenses.slice(0, 5)),
    [recentExpenses, showMoreExpenses],
  )

  const activeTemplates = useMemo(
    () => plantillas.filter((template) => template.activo),
    [plantillas],
  )

  useEffect(() => {
    setShowMoreExpenses(false)
  }, [showCanceled])

  useEffect(() => {
    setShowMorePeriods(false)
  }, [periodMode])

  async function handleSaveExpense() {
    if (!adminAccess.isAdmin) {
      toast.error("Solo un administrador puede registrar egresos")
      return
    }

    const concepto = expenseForm.concepto.trim()
    const categoria = expenseForm.categoria.trim()
    const monto = Number(expenseForm.monto)

    if (!expenseForm.fecha) {
      toast.error("Selecciona la fecha del egreso")
      return
    }
    if (!categoria) {
      toast.error("Selecciona una categoria")
      return
    }
    if (!concepto) {
      toast.error("Captura el concepto del egreso")
      return
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("Captura un monto valido mayor a cero")
      return
    }

    try {
      setIsSavingExpense(true)
      const payload: EgresoInsert = {
        fecha: expenseForm.fecha,
        categoria,
        medio_salida: expenseForm.medio_salida,
        concepto,
        monto,
      }
      const { error } = await supabase.from("egresos").insert(payload)
      if (error) {
        throw error
      }

      setExpenseForm((current) => ({
        ...current,
        concepto: "",
        monto: "",
      }))
      toast.success("Egreso registrado")
      await loadAccountingData()
    } catch (error) {
      console.error("Error al registrar egreso:", error)
      toast.error("No se pudo guardar el egreso")
    } finally {
      setIsSavingExpense(false)
    }
  }

  function applyTemplate(template: EgresoPlantilla) {
    setExpenseForm((current) => ({
      ...current,
      categoria: template.categoria,
      medio_salida: template.medio_salida,
      concepto: template.concepto_base,
      monto:
        template.monto_sugerido && template.monto_sugerido > 0
          ? String(template.monto_sugerido)
          : current.monto,
    }))
  }

  function handleSelectCaptureTemplate(templateId: string) {
    setCaptureTemplateId(templateId)
    const selectedTemplate = activeTemplates.find((template) => template.id === templateId)
    if (!selectedTemplate) {
      return
    }
    applyTemplate(selectedTemplate)
  }

  async function handleCreateTemplate() {
    const nombre = templateForm.nombre.trim()
    const categoria = templateForm.categoria.trim()
    const conceptoBase = templateForm.concepto_base.trim()
    const montoSugeridoRaw = templateForm.monto_sugerido.trim()
    const montoSugerido = montoSugeridoRaw ? Number(montoSugeridoRaw) : null

    if (!nombre) {
      toast.error("Nombre de plantilla obligatorio")
      return
    }
    if (!categoria) {
      toast.error("Categoria de plantilla obligatoria")
      return
    }
    if (!conceptoBase) {
      toast.error("Concepto base obligatorio")
      return
    }
    if (
      montoSugeridoRaw &&
      (!Number.isFinite(montoSugerido) || (montoSugerido ?? 0) <= 0)
    ) {
      toast.error("Monto sugerido invalido")
      return
    }

    try {
      setIsSavingTemplate(true)
      const payload: EgresoPlantillaInsert = {
        nombre,
        categoria,
        concepto_base: conceptoBase,
        monto_sugerido: montoSugerido,
        medio_salida: templateForm.medio_salida,
      }

      const { error } = await supabase.from("egreso_plantillas").insert(payload)
      if (error) {
        throw error
      }

      setTemplateForm({
        nombre: "",
        categoria: "Proveedor",
        concepto_base: "",
        monto_sugerido: "",
        medio_salida: "efectivo",
      })
      toast.success("Plantilla guardada")
      await loadAccountingData()
    } catch (error) {
      console.error("Error al guardar plantilla:", error)
      toast.error("No se pudo guardar la plantilla")
    } finally {
      setIsSavingTemplate(false)
    }
  }

  function startTemplateEdition(template: EgresoPlantilla) {
    setEditingTemplateId(template.id)
    setEditingTemplate({
      nombre: template.nombre,
      categoria: template.categoria,
      concepto_base: template.concepto_base,
      monto_sugerido: template.monto_sugerido ? String(template.monto_sugerido) : "",
      medio_salida: template.medio_salida,
    })
  }

  async function handleUpdateTemplate(templateId: string) {
    if (!editingTemplate) {
      return
    }

    const nombre = editingTemplate.nombre.trim()
    const categoria = editingTemplate.categoria.trim()
    const conceptoBase = editingTemplate.concepto_base.trim()
    const montoSugeridoRaw = editingTemplate.monto_sugerido.trim()
    const montoSugerido = montoSugeridoRaw ? Number(montoSugeridoRaw) : null

    if (!nombre || !categoria || !conceptoBase) {
      toast.error("Completa nombre, categoria y concepto")
      return
    }
    if (
      montoSugeridoRaw &&
      (!Number.isFinite(montoSugerido) || (montoSugerido ?? 0) <= 0)
    ) {
      toast.error("Monto sugerido invalido")
      return
    }

    try {
      setIsSavingTemplate(true)
      const payload: EgresoPlantillaUpdate = {
        nombre,
        categoria,
        concepto_base: conceptoBase,
        monto_sugerido: montoSugerido,
        medio_salida: editingTemplate.medio_salida,
      }

      const { error } = await supabase
        .from("egreso_plantillas")
        .update(payload)
        .eq("id", templateId)

      if (error) {
        throw error
      }

      setEditingTemplateId(null)
      setEditingTemplate(null)
      toast.success("Plantilla actualizada")
      await loadAccountingData()
    } catch (error) {
      console.error("Error al actualizar plantilla:", error)
      toast.error("No se pudo actualizar la plantilla")
    } finally {
      setIsSavingTemplate(false)
    }
  }

  async function handleToggleTemplate(template: EgresoPlantilla) {
    try {
      const { error } = await supabase
        .from("egreso_plantillas")
        .update({ activo: !template.activo })
        .eq("id", template.id)

      if (error) {
        throw error
      }

      toast.success(template.activo ? "Plantilla desactivada" : "Plantilla activada")
      await loadAccountingData()
    } catch (error) {
      console.error("Error al cambiar estado de plantilla:", error)
      toast.error("No se pudo actualizar la plantilla")
    }
  }

  async function handleCancelExpense(egreso: Egreso) {
    const motivo = window.prompt("Motivo de cancelacion (breve):", "")
    if (motivo === null) {
      return
    }

    const motivoLimpio = motivo.trim()
    if (!motivoLimpio) {
      toast.error("El motivo es obligatorio para cancelar")
      return
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { error } = await supabase
        .from("egresos")
        .update({
          cancelado: true,
          motivo_cancelacion: motivoLimpio,
          cancelado_en: new Date().toISOString(),
          cancelado_por: user?.id ?? null,
        })
        .eq("id", egreso.id)

      if (error) {
        throw error
      }

      toast.success("Egreso cancelado")
      await loadAccountingData()
    } catch (error) {
      console.error("Error al cancelar egreso:", error)
      toast.error("No se pudo cancelar el egreso")
    }
  }

  async function handleDeleteExpense(egreso: Egreso) {
    const firstCheck = window.confirm(
      `Vas a eliminar el egreso "${egreso.concepto}" por ${currencyFormatter.format(egreso.monto)}. Esta accion no se puede deshacer.`,
    )

    if (!firstCheck) {
      return
    }

    const secondCheck = window.prompt(
      'Confirmacion fuerte: escribe "ELIMINAR" para continuar.',
      "",
    )

    if (secondCheck !== "ELIMINAR") {
      toast.error("Eliminacion cancelada")
      return
    }

    try {
      const { error } = await supabase.from("egresos").delete().eq("id", egreso.id)
      if (error) {
        throw error
      }

      toast.success("Egreso eliminado")
      await loadAccountingData()
    } catch (error) {
      console.error("Error al eliminar egreso:", error)
      toast.error("No se pudo eliminar el egreso")
    }
  }

  async function handleSaveArqueo() {
    const fondo = Number(fondoInicial)
    if (!Number.isFinite(fondo) || fondo < 0) {
      toast.error("Fondo inicial invalido")
      return
    }

    try {
      setIsSavingArqueo(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const payload: CierreCajaInsert = {
        fecha: selectedDate,
        fondo_inicial: fondo,
        conteo_denominaciones: {
          ...denominationCounts,
          total_billetes_manual: toMoneyNumber(totalBilletes),
          total_monedas_manual: toMoneyNumber(totalMonedas),
        },
        contado_total: countedTotal,
        esperado_total: expectedTotal,
        diferencia: diferenciaArqueo,
        notas: arqueoNotas.trim() || null,
        cerrado_por: user?.id ?? null,
      }

      const { error } = await supabase
        .from("cierres_caja")
        .upsert(payload, { onConflict: "fecha" })

      if (error) {
        throw error
      }

      toast.success(
        cierreSeleccionado ? "Cierre actualizado" : "Cierre guardado",
      )
      await loadAccountingData()
    } catch (error) {
      console.error("Error al guardar cierre de caja:", error)
      toast.error("No se pudo guardar el cierre")
    } finally {
      setIsSavingArqueo(false)
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-[2rem] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm font-medium text-slate-500">
          Cargando contabilidad...
        </div>
      </section>
    )
  }

  if (!adminAccess.isAuthenticated) {
    return (
      <section className="rounded-[2rem] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
        <div className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Contabilidad
          </p>
          <h2 className="mt-3 text-3xl font-black text-slate-900">
            Inicia sesion como administrador
          </h2>
          <p className="mt-3 text-sm text-slate-500">
            Usa el boton flotante de admin para consultar y capturar movimientos.
          </p>
        </div>
      </section>
    )
  }

  if (!adminAccess.isAdmin) {
    return (
      <section className="rounded-[2rem] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">
            Contabilidad
          </p>
          <h2 className="mt-3 text-3xl font-black text-slate-900">
            Usuario sin permisos financieros
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            La cuenta {adminAccess.email ?? "actual"} no tiene permisos de
            administrador para consultar o capturar egresos.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-[2rem] bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
            Contabilidad
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Control financiero operativo
          </h2>
        </div>

        <button
          type="button"
          onClick={() => void loadAccountingData()}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100"
        >
          Recargar
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Fecha de corte
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate(todayKey)}
              className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                selectedDate === todayKey
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(yesterdayKey)}
              className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                selectedDate === yesterdayKey
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              Ayer
            </button>
          </div>

          <input
            type="date"
            value={selectedDate}
            max={todayKey}
            onChange={(event) => {
              const value = event.target.value
              if (!value) {
                return
              }
              setSelectedDate(value > todayKey ? todayKey : value)
            }}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 sm:w-auto"
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          <div className="flex min-w-max snap-x snap-mandatory gap-2">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`snap-start whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                activeTab === tab.key
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {activeTab === "hoy" ? (
        <div className="mt-4 rounded-3xl bg-slate-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Resumen del dia seleccionado
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Cobrado
              </p>
              <p className="mt-1 text-lg font-black text-emerald-600">
                {currencyFormatter.format(kpisSelectedDate.cobrado)}
              </p>
            </article>
            <article className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Pendiente
              </p>
              <p className="mt-1 text-lg font-black text-amber-600">
                {currencyFormatter.format(kpisSelectedDate.pendiente)}
              </p>
            </article>
            <article className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Egresos
              </p>
              <p className="mt-1 text-lg font-black text-rose-600">
                {currencyFormatter.format(kpisSelectedDate.egresos)}
              </p>
            </article>
            <article className="rounded-2xl bg-slate-900 p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Neto
              </p>
              <p className="mt-1 text-lg font-black text-white">
                {currencyFormatter.format(kpisSelectedDate.neto)}
              </p>
            </article>
            <article className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Cobrado efectivo
              </p>
              <p className="mt-1 text-lg font-black text-emerald-600">
                {currencyFormatter.format(efectivoCobradoSelectedDate)}
              </p>
            </article>
            <article className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Cobrado transferencia
              </p>
              <p className="mt-1 text-lg font-black text-sky-600">
                {currencyFormatter.format(transferenciaCobradaSelectedDate)}
              </p>
            </article>
          </div>
        </div>
      ) : null}

      {activeTab === "captura" ? (
        <section className="mt-4 rounded-3xl bg-slate-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Captura rapida de egreso
          </p>
          <div className="mt-3 grid gap-3">
            <div>
              <label
                htmlFor="capture-template-select"
                className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
              >
                Plantilla de egreso/insumo
              </label>
              <select
                id="capture-template-select"
                value={captureTemplateId}
                onChange={(event) => handleSelectCaptureTemplate(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
              >
                <option value="">Selecciona una plantilla activa (opcional)</option>
                {activeTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.nombre}
                  </option>
                ))}
              </select>
            </div>

            {activeTemplates.length > 0 ? (
              <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                <div className="flex min-w-max gap-2">
                  {activeTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleSelectCaptureTemplate(template.id)}
                      className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-bold transition ${
                        captureTemplateId === template.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {template.nombre}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                No hay plantillas activas para autocompletar.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label
                  htmlFor="expense-date"
                  className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  Fecha
                </label>
                <input
                  id="expense-date"
                  type="date"
                  value={expenseForm.fecha}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      fecha: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>
              <div>
                <label
                  htmlFor="expense-category"
                  className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  Categoria
                </label>
                <select
                  id="expense-category"
                  value={expenseForm.categoria}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      categoria: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                >
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label
                  htmlFor="expense-medium"
                  className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  Medio de salida
                </label>
                <select
                  id="expense-medium"
                  value={expenseForm.medio_salida}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      medio_salida: event.target.value as MedioSalida,
                    }))
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                >
                  {MEDIO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="expense-amount"
                  className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  Monto
                </label>
                <input
                  id="expense-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.monto}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      monto: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-lg font-black text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="expense-concept"
                className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
              >
                Concepto
              </label>
              <input
                id="expense-concept"
                type="text"
                value={expenseForm.concepto}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    concepto: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                placeholder="Ej. compra de insumos"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleSaveExpense()}
              disabled={isSavingExpense}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              {isSavingExpense ? "Guardando..." : "Registrar egreso"}
            </button>
          </div>
        </section>
      ) : null}

      {activeTab === "egresos" ? (
        <section className="mt-4 rounded-3xl bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Egresos recientes
            </p>
            <div className="rounded-full border border-slate-200 bg-white p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setShowCanceled(false)}
                className={`rounded-full px-3 py-1 ${
                  !showCanceled ? "bg-slate-900 text-white" : "text-slate-600"
                }`}
              >
                Activos
              </button>
              <button
                type="button"
                onClick={() => setShowCanceled(true)}
                className={`rounded-full px-3 py-1 ${
                  showCanceled ? "bg-slate-900 text-white" : "text-slate-600"
                }`}
              >
                Cancelados
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {visibleExpenses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-sm text-slate-500">
                No hay egresos en el periodo.
              </div>
            ) : (
              visibleExpenses.map((egreso) => (
                <article
                  key={egreso.id}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{egreso.concepto}</p>
                        {egreso.cancelado ? (
                          <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-700">
                            Cancelado
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                        {egreso.categoria} • {egreso.medio_salida} • {formatDateLabel(egreso.fecha)}
                      </p>
                      {egreso.cancelado && egreso.motivo_cancelacion ? (
                        <p className="mt-1 text-xs text-rose-700">
                          Motivo: {egreso.motivo_cancelacion}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-rose-600">
                        {currencyFormatter.format(egreso.monto)}
                      </span>

                      {!egreso.cancelado ? (
                        <button
                          type="button"
                          onClick={() => void handleCancelExpense(egreso)}
                          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700"
                        >
                          Cancelar
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void handleDeleteExpense(egreso)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          {recentExpenses.length > visibleExpenses.length ? (
            <button
              type="button"
              onClick={() => setShowMoreExpenses(true)}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
            >
              Ver mas
            </button>
          ) : null}
        </section>
      ) : null}

      {activeTab === "arqueo" ? (
        <section className="mt-4 rounded-3xl bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Arqueo de caja
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                {formatDateLabel(selectedDate)}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${
                  cierreSeleccionado
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {cierreSeleccionado ? "Cerrado" : "Sin cierre"}
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <article className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Esperado
              </p>
              <p className="mt-1 text-lg font-black text-slate-900">
                {currencyFormatter.format(expectedTotal)}
              </p>
            </article>
            <article className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Contado
              </p>
              <p className="mt-1 text-lg font-black text-slate-900">
                {currencyFormatter.format(countedTotal)}
              </p>
            </article>
            <article className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Diferencia
              </p>
              <p
                className={`mt-1 text-lg font-black ${
                  diferenciaArqueo > 0
                    ? "text-emerald-600"
                    : diferenciaArqueo < 0
                      ? "text-rose-600"
                      : "text-slate-900"
                }`}
              >
                {currencyFormatter.format(diferenciaArqueo)}
              </p>
            </article>
          </div>

          <div className="mt-3 rounded-2xl bg-white p-3 shadow-sm">
            <label
              htmlFor="fondo-inicial"
              className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
            >
              Fondo inicial
            </label>
            <input
              id="fondo-inicial"
              type="number"
              min="0"
              step="0.01"
              value={fondoInicial}
              onChange={(event) => setFondoInicial(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold"
            />

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="total-billetes"
                  className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  Total en billetes
                </label>
                <input
                  id="total-billetes"
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalBilletes}
                  onChange={(event) => setTotalBilletes(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div>
                <label
                  htmlFor="total-monedas"
                  className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  Total en monedas
                </label>
                <input
                  id="total-monedas"
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalMonedas}
                  onChange={(event) => setTotalMonedas(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold"
                />
              </div>
            </div>

            <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Referencia por denominaciones: billetes {currencyFormatter.format(denominationSplit.billetes)} / monedas {currencyFormatter.format(denominationSplit.monedas)} / total {currencyFormatter.format(countedFromDenominations)}
            </div>

            <button
              type="button"
              onClick={() => setShowDenominationDetail((current) => !current)}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700"
            >
              {showDenominationDetail
                ? "Ocultar detalle de denominaciones"
                : "Detalle de denominaciones"}
            </button>

            {showDenominationDetail ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {DENOMINATIONS.map((denomination) => {
                  const key = String(denomination)
                  return (
                    <label
                      key={key}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <p className="text-xs font-bold text-slate-500">
                        {currencyFormatter.format(denomination)}
                      </p>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={denominationCounts[key] ?? 0}
                        onChange={(event) => {
                          const next = Number(event.target.value)
                          setDenominationCounts((current) => ({
                            ...current,
                            [key]:
                              Number.isFinite(next) && next >= 0 ? Math.floor(next) : 0,
                          }))
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm font-semibold"
                      />
                    </label>
                  )
                })}
              </div>
            ) : null}

            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Efectivo cobrado del dia</span>
                <span className="font-black text-emerald-600">
                  {currencyFormatter.format(efectivoCobradoSelectedDate)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Egresos efectivo del dia</span>
                <span className="font-black text-rose-600">
                  {currencyFormatter.format(egresosEfectivoSelectedDate)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Egresos transferencia del dia</span>
                <span className="font-black text-sky-600">
                  {currencyFormatter.format(egresosTransferenciaSelectedDate)}
                </span>
              </div>
            </div>

            <div className="mt-3">
              <label
                htmlFor="arqueo-notas"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
              >
                Notas
              </label>
              <textarea
                id="arqueo-notas"
                value={arqueoNotas}
                onChange={(event) => setArqueoNotas(event.target.value)}
                className="mt-1 h-20 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleSaveArqueo()}
            disabled={isSavingArqueo}
            className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSavingArqueo
              ? "Guardando..."
              : cierreSeleccionado
                ? "Reemplazar cierre de la fecha"
                : "Guardar cierre de la fecha"}
          </button>
        </section>
      ) : null}

      {activeTab === "periodos" ? (
        <section className="mt-4 rounded-3xl bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Tabla de periodos
            </p>
            <div className="flex gap-2">
              {(["dia", "semana", "mes"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPeriodMode(mode)}
                  className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] ${
                    periodMode === mode
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr_1fr] gap-2 border-b border-slate-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <span>Fecha/rango</span>
              <span>Cobrado</span>
              <span>Pendiente</span>
              <span>Egresos</span>
              <span>Neto</span>
            </div>

            <div className="divide-y divide-slate-100">
              {visiblePeriodRows.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-slate-500">
                  Aun no hay movimientos para este periodo.
                </div>
              ) : (
                visiblePeriodRows.map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[1.3fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-3 text-xs sm:text-sm"
                  >
                    <span className="font-bold text-slate-900">{row.label}</span>
                    <span className="font-semibold text-emerald-600">
                      {currencyFormatter.format(row.cobrado)}
                    </span>
                    <span className="font-semibold text-amber-600">
                      {currencyFormatter.format(row.pendiente)}
                    </span>
                    <span className="font-semibold text-rose-600">
                      {currencyFormatter.format(row.egresos)}
                    </span>
                    <span
                      className={`font-black ${
                        row.neto >= 0 ? "text-slate-900" : "text-rose-600"
                      }`}
                    >
                      {currencyFormatter.format(row.neto)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {periodRows.length > visiblePeriodRows.length ? (
            <button
              type="button"
              onClick={() => setShowMorePeriods(true)}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
            >
              Ver mas
            </button>
          ) : null}
        </section>
      ) : null}

      {activeTab === "plantillas" ? (
        <section className="mt-4 rounded-3xl bg-slate-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Plantillas recurrentes
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {activeTemplates.length === 0 ? (
              <span className="rounded-2xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
                Sin plantillas activas
              </span>
            ) : (
              activeTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    applyTemplate(template)
                    setActiveTab("captura")
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  {template.nombre}
                </button>
              ))
            )}
          </div>

          <div className="mt-3 grid gap-2 rounded-2xl bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Nueva plantilla
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                type="text"
                value={templateForm.nombre}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    nombre: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                placeholder="Nombre"
              />
              <input
                type="text"
                value={templateForm.categoria}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    categoria: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                placeholder="Categoria"
              />
              <input
                type="text"
                value={templateForm.concepto_base}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    concepto_base: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 md:col-span-2"
                placeholder="Concepto base"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={templateForm.monto_sugerido}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    monto_sugerido: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                placeholder="Monto sugerido"
              />
              <select
                value={templateForm.medio_salida}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    medio_salida: event.target.value as MedioSalida,
                  }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
              >
                {MEDIO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => void handleCreateTemplate()}
              disabled={isSavingTemplate}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSavingTemplate ? "Guardando..." : "Agregar plantilla"}
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {plantillas.map((template) => {
              const isEditing = editingTemplateId === template.id && editingTemplate
              return (
                <article
                  key={template.id}
                  className="rounded-2xl border border-slate-200 bg-white p-3"
                >
                  {isEditing ? (
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        type="text"
                        value={editingTemplate.nombre}
                        onChange={(event) =>
                          setEditingTemplate((current) =>
                            current
                              ? { ...current, nombre: event.target.value }
                              : current,
                          )
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={editingTemplate.categoria}
                        onChange={(event) =>
                          setEditingTemplate((current) =>
                            current
                              ? { ...current, categoria: event.target.value }
                              : current,
                          )
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={editingTemplate.concepto_base}
                        onChange={(event) =>
                          setEditingTemplate((current) =>
                            current
                              ? { ...current, concepto_base: event.target.value }
                              : current,
                          )
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editingTemplate.monto_sugerido}
                        onChange={(event) =>
                          setEditingTemplate((current) =>
                            current
                              ? { ...current, monto_sugerido: event.target.value }
                              : current,
                          )
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <select
                        value={editingTemplate.medio_salida}
                        onChange={(event) =>
                          setEditingTemplate((current) =>
                            current
                              ? {
                                  ...current,
                                  medio_salida: event.target.value as MedioSalida,
                                }
                              : current,
                          )
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      >
                        {MEDIO_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <div className="flex gap-2 md:col-span-2">
                        <button
                          type="button"
                          onClick={() => void handleUpdateTemplate(template.id)}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTemplateId(null)
                            setEditingTemplate(null)
                          }}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {template.nombre}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                          {template.categoria} • {template.medio_salida}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startTemplateEdition(template)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleTemplate(template)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
                        >
                          {template.activo ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
    </section>
  )
}

export default AccountingDashboard
