import { useEffect, useMemo, useState } from "react"
import { toast } from "react-hot-toast"
import { formatDateTime } from "../lib/datetime"
import { supabase } from "../lib/supabase"
import type { AuditoriaEvento, AuditoriaModulo } from "../types/database"

type DateFilter = "today" | "7d" | "30d" | "all"

const MODULE_FILTERS: Array<{ value: AuditoriaModulo | "all"; label: string }> = [
  { value: "all", label: "Todo" },
  { value: "inventario", label: "Inventario" },
  { value: "productos", label: "Productos" },
  { value: "pedidos", label: "Pedidos" },
  { value: "contabilidad", label: "Contabilidad" },
  { value: "clientes", label: "Clientes" },
  { value: "sistema", label: "Sistema" },
]

const DATE_FILTERS: Array<{ value: DateFilter; label: string }> = [
  { value: "today", label: "Hoy" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "Todo" },
]

function buildDateFromFilter(filter: DateFilter) {
  if (filter === "all") {
    return null
  }

  const now = new Date()

  if (filter === "today") {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return start.toISOString()
  }

  const days = filter === "7d" ? 7 : 30
  const start = new Date(now)
  start.setDate(start.getDate() - days)
  return start.toISOString()
}

function formatModulo(modulo: string) {
  return modulo.charAt(0).toUpperCase() + modulo.slice(1)
}

function formatActor(evento: AuditoriaEvento) {
  return evento.actor_email?.trim() || evento.actor_uid || "admin"
}

function getDetalleResumen(detalle: AuditoriaEvento["detalle"]) {
  if (!detalle || typeof detalle !== "object" || Array.isArray(detalle)) {
    return "Sin detalle"
  }

  const entries = Object.entries(detalle as Record<string, unknown>)
  if (entries.length === 0) {
    return "Sin detalle"
  }

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ")
}

export function AuditLog() {
  const [events, setEvents] = useState<AuditoriaEvento[]>([])
  const [loading, setLoading] = useState(true)
  const [moduleFilter, setModuleFilter] = useState<AuditoriaModulo | "all">("all")
  const [dateFilter, setDateFilter] = useState<DateFilter>("7d")

  const loadEvents = useMemo(
    () => async () => {
      try {
        setLoading(true)
        let query = supabase
          .from("auditoria_eventos")
          .select("*")
          .order("creado_en", { ascending: false })
          .limit(100)

        if (moduleFilter !== "all") {
          query = query.eq("modulo", moduleFilter)
        }

        const fromDate = buildDateFromFilter(dateFilter)
        if (fromDate) {
          query = query.gte("creado_en", fromDate)
        }

        const { data, error } = await query

        if (error) {
          throw error
        }

        setEvents((data ?? []) as AuditoriaEvento[])
      } catch (error) {
        console.error("Error al cargar auditoria:", error)
        toast.error("No se pudo cargar la auditoria")
      } finally {
        setLoading(false)
      }
    },
    [dateFilter, moduleFilter],
  )

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  return (
    <section className="rounded-[2rem] bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Seguridad</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Auditoria</h2>
          <p className="mt-2 text-sm text-slate-500">Bitacora visible de eventos criticos administrativos.</p>
        </div>

        <button
          type="button"
          onClick={() => void loadEvents()}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100"
        >
          Recargar
        </button>
      </div>

      <div className="mt-5 space-y-3">
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max items-center gap-2">
            {MODULE_FILTERS.map((filter) => {
              const active = moduleFilter === filter.value
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setModuleFilter(filter.value)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max items-center gap-2">
            {DATE_FILTERS.map((filter) => {
              const active = dateFilter === filter.value
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setDateFilter(filter.value)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] transition ${
                    active
                      ? "border-emerald-700 bg-emerald-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm font-medium text-slate-500">
            Cargando eventos de auditoria...
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm font-medium text-slate-500">
            No hay eventos para los filtros seleccionados.
          </div>
        ) : (
          events.map((event) => (
            <article
              key={event.id}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm font-black text-slate-900">{event.accion}</p>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {formatDateTime(event.creado_en)}
                </p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-1 font-bold uppercase tracking-[0.14em] text-slate-700 ring-1 ring-slate-200">
                  {formatModulo(event.modulo)}
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
                  {event.entidad}
                  {event.entidad_id ? ` / ${event.entidad_id}` : ""}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-600">{getDetalleResumen(event.detalle)}</p>

              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Actor: {formatActor(event)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

export default AuditLog
