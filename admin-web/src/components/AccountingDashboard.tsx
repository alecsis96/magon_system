import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import { supabase } from "../lib/supabase"
import type { Egreso, EgresoInsert, Pedido } from "../types/database"

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
  "Otros",
] as const

type ExpenseFormState = {
  fecha: string
  categoria: (typeof EXPENSE_CATEGORIES)[number]
  concepto: string
  monto: string
}

function getTodayLocalISODate() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)

  return localDate.toISOString().slice(0, 10)
}

function getMonthRange() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  return {
    monthStartDate: monthStart.toISOString().slice(0, 10),
    nextMonthStartDate: nextMonthStart.toISOString().slice(0, 10),
    monthLabel: new Intl.DateTimeFormat("es-MX", {
      month: "long",
      year: "numeric",
    }).format(now),
  }
}

function toLocalDateKey(value: string | null) {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

function buildSummary(pedidos: Pedido[], egresos: Egreso[]) {
  const facturado = pedidos.reduce((sum, pedido) => sum + pedido.total, 0)
  const cobrado = pedidos.reduce(
    (sum, pedido) => sum + (pedido.estado_pago === "pagado" ? pedido.total : 0),
    0,
  )
  const pendiente = pedidos.reduce(
    (sum, pedido) =>
      sum + (pedido.estado_pago === "pendiente" ? pedido.total : 0),
    0,
  )
  const totalEgresos = egresos.reduce((sum, egreso) => sum + egreso.monto, 0)

  return {
    facturado,
    cobrado,
    pendiente,
    egresos: totalEgresos,
    neto: cobrado - totalEgresos,
  }
}

function getPaymentBreakdown(pedidos: Pedido[]) {
  return {
    efectivo: pedidos.reduce(
      (sum, pedido) =>
        sum +
        (pedido.estado_pago === "pagado" && pedido.metodo_pago === "efectivo"
          ? pedido.total
          : 0),
      0,
    ),
    transferencia: pedidos.reduce(
      (sum, pedido) =>
        sum +
        (pedido.estado_pago === "pagado" &&
        pedido.metodo_pago === "transferencia"
          ? pedido.total
          : 0),
      0,
    ),
  }
}

function getMonthDailyRows(pedidos: Pedido[], egresos: Egreso[]) {
  const rows = new Map<
    string,
    { fecha: string; cobrado: number; pendiente: number; egresos: number }
  >()

  for (const pedido of pedidos) {
    const key = toLocalDateKey(pedido.fecha_creacion)

    if (!key) {
      continue
    }

    const current = rows.get(key) ?? {
      fecha: key,
      cobrado: 0,
      pendiente: 0,
      egresos: 0,
    }

    if (pedido.estado_pago === "pagado") {
      current.cobrado += pedido.total
    } else {
      current.pendiente += pedido.total
    }

    rows.set(key, current)
  }

  for (const egreso of egresos) {
    const key = egreso.fecha
    const current = rows.get(key) ?? {
      fecha: key,
      cobrado: 0,
      pendiente: 0,
      egresos: 0,
    }

    current.egresos += egreso.monto
    rows.set(key, current)
  }

  return Array.from(rows.values())
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .map((row) => ({
      ...row,
      neto: row.cobrado - row.egresos,
    }))
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
  }).format(new Date(year, (month ?? 1) - 1, day ?? 1))
}

export function AccountingDashboard() {
  const [adminAccess, setAdminAccess] = useState<AdminAccess>(DEFAULT_ACCESS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingExpense, setIsSavingExpense] = useState(false)
  const [pedidosMes, setPedidosMes] = useState<Pedido[]>([])
  const [egresosMes, setEgresosMes] = useState<Egreso[]>([])
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>({
    fecha: getTodayLocalISODate(),
    categoria: "Proveedor",
    concepto: "",
    monto: "",
  })

  const todayKey = getTodayLocalISODate()
  const { monthStartDate, nextMonthStartDate, monthLabel } = getMonthRange()

  async function loadAdminState() {
    try {
      const access = await getAdminAccess()
      setAdminAccess(access)
      return access
    } catch (error) {
      console.error("Error al validar acceso admin:", error)
      setAdminAccess(DEFAULT_ACCESS)
      return DEFAULT_ACCESS
    }
  }

  async function loadAccountingData() {
    try {
      setIsLoading(true)

      const access = await loadAdminState()

      if (!access.isAdmin) {
        setPedidosMes([])
        setEgresosMes([])
        return
      }

      const [{ data: pedidosData, error: pedidosError }, { data: egresosData, error: egresosError }] =
        await Promise.all([
          supabase
            .from("pedidos")
            .select("*")
            .gte("fecha_creacion", `${monthStartDate}T00:00:00.000Z`)
            .lt("fecha_creacion", `${nextMonthStartDate}T00:00:00.000Z`)
            .order("fecha_creacion", { ascending: false }),
          supabase
            .from("egresos")
            .select("*")
            .gte("fecha", monthStartDate)
            .lt("fecha", nextMonthStartDate)
            .order("fecha", { ascending: false })
            .order("creado_en", { ascending: false }),
        ])

      if (pedidosError) {
        throw pedidosError
      }

      if (egresosError) {
        throw egresosError
      }

      setPedidosMes((pedidosData ?? []) as Pedido[])
      setEgresosMes((egresosData ?? []) as Egreso[])
    } catch (error) {
      console.error("Error al cargar contabilidad:", error)
      toast.error("No se pudo cargar la contabilidad")
    } finally {
      setIsLoading(false)
    }
  }

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
  }, [])

  async function handleSaveExpense() {
    if (!adminAccess.isAdmin) {
      toast.error("Solo un administrador puede registrar egresos")
      return
    }

    const concepto = expenseForm.concepto.trim()
    const monto = Number(expenseForm.monto)

    if (!concepto) {
      toast.error("Captura el concepto del egreso")
      return
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("Captura un monto valido")
      return
    }

    try {
      setIsSavingExpense(true)

      const payload: EgresoInsert = {
        fecha: expenseForm.fecha,
        categoria: expenseForm.categoria,
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

  const pedidosHoy = pedidosMes.filter(
    (pedido) => toLocalDateKey(pedido.fecha_creacion) === todayKey,
  )
  const egresosHoy = egresosMes.filter((egreso) => egreso.fecha === todayKey)
  const summaryHoy = buildSummary(pedidosHoy, egresosHoy)
  const summaryMes = buildSummary(pedidosMes, egresosMes)
  const paymentBreakdown = getPaymentBreakdown(pedidosMes)
  const monthRows = getMonthDailyRows(pedidosMes, egresosMes).slice(0, 12)

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
            Usa el boton flotante de admin para consultar ingresos, egresos y
            resumen mensual.
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
    <section className="rounded-[2rem] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Contabilidad
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
            Ingresos y egresos
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Resumen financiero del dia y del mes para {monthLabel}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAccountingData()}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100"
        >
          Recargar
        </button>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-[2rem] bg-slate-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Hoy
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <article className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Cobrado
              </p>
              <p className="mt-3 text-3xl font-black text-emerald-600">
                {currencyFormatter.format(summaryHoy.cobrado)}
              </p>
            </article>
            <article className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Pendiente
              </p>
              <p className="mt-3 text-3xl font-black text-amber-600">
                {currencyFormatter.format(summaryHoy.pendiente)}
              </p>
            </article>
            <article className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Egresos
              </p>
              <p className="mt-3 text-3xl font-black text-rose-600">
                {currencyFormatter.format(summaryHoy.egresos)}
              </p>
            </article>
            <article className="rounded-3xl bg-slate-900 p-5 text-white shadow-[0_20px_45px_rgba(15,23,42,0.18)]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                Neto del dia
              </p>
              <p className="mt-3 text-3xl font-black text-white">
                {currencyFormatter.format(summaryHoy.neto)}
              </p>
            </article>
          </div>
        </section>

        <section className="rounded-[2rem] bg-slate-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Mes actual
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <article className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Facturado
              </p>
              <p className="mt-3 text-3xl font-black text-slate-900">
                {currencyFormatter.format(summaryMes.facturado)}
              </p>
            </article>
            <article className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Cobrado
              </p>
              <p className="mt-3 text-3xl font-black text-emerald-600">
                {currencyFormatter.format(summaryMes.cobrado)}
              </p>
            </article>
            <article className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Egresos
              </p>
              <p className="mt-3 text-3xl font-black text-rose-600">
                {currencyFormatter.format(summaryMes.egresos)}
              </p>
            </article>
            <article className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Neto cobrado
              </p>
              <p className="mt-3 text-3xl font-black text-sky-600">
                {currencyFormatter.format(summaryMes.neto)}
              </p>
            </article>
          </div>
        </section>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] bg-slate-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Registrar egreso
          </p>
          <h3 className="mt-2 text-2xl font-black text-slate-900">
            Salida de dinero
          </h3>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="expense-date"
                  className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
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
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label
                  htmlFor="expense-category"
                  className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                >
                  Categoria
                </label>
                <select
                  id="expense-category"
                  value={expenseForm.categoria}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      categoria: event.target.value as ExpenseFormState["categoria"],
                    }))
                  }
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                >
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="expense-concept"
                className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
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
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="expense-amount"
                className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
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
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-xl font-black text-slate-900 outline-none transition focus:border-slate-400"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleSaveExpense()}
              disabled={isSavingExpense}
              className="rounded-3xl bg-slate-900 px-6 py-4 text-sm font-black text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              {isSavingExpense ? "Guardando..." : "Registrar egreso"}
            </button>
          </div>
        </section>

        <section className="rounded-[2rem] bg-slate-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Cobranza
          </p>
          <h3 className="mt-2 text-2xl font-black text-slate-900">
            Metodos de pago del mes
          </h3>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <article className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Efectivo cobrado
              </p>
              <p className="mt-3 text-3xl font-black text-emerald-600">
                {currencyFormatter.format(paymentBreakdown.efectivo)}
              </p>
            </article>
            <article className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Transferencia cobrada
              </p>
              <p className="mt-3 text-3xl font-black text-sky-600">
                {currencyFormatter.format(paymentBreakdown.transferencia)}
              </p>
            </article>
          </div>

          <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Egresos recientes
                </p>
                <h4 className="mt-2 text-lg font-black text-slate-900">
                  Ultimos movimientos
                </h4>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                {egresosMes.length} registros
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {egresosMes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  No hay egresos registrados este mes.
                </div>
              ) : (
                egresosMes.slice(0, 6).map((egreso) => (
                  <article
                    key={egreso.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {egreso.concepto}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {egreso.categoria} • {formatDateLabel(egreso.fecha)}
                        </p>
                      </div>
                      <span className="text-sm font-black text-rose-600">
                        {currencyFormatter.format(egreso.monto)}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-8 rounded-[2rem] bg-slate-50 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Corte mensual
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">
              Desglose por dia
            </h3>
          </div>
          <p className="text-sm text-slate-500">
            Ingresos cobrados, pendientes y egresos del mes actual.
          </p>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-4 border-b border-slate-200 px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <span>Fecha</span>
            <span>Cobrado</span>
            <span>Egresos</span>
            <span>Neto</span>
          </div>

          <div className="divide-y divide-slate-100">
            {monthRows.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                Aun no hay movimientos este mes.
              </div>
            ) : (
              monthRows.map((row) => (
                <div
                  key={row.fecha}
                  className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-4 px-5 py-4 text-sm"
                >
                  <span className="font-bold text-slate-900">
                    {formatDateLabel(row.fecha)}
                  </span>
                  <span className="font-semibold text-emerald-600">
                    {currencyFormatter.format(row.cobrado)}
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
      </div>
    </section>
  )
}

export default AccountingDashboard
