import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import { formatDateTime } from "../lib/datetime"
import { sendDispatchPushNotification } from "../lib/push"
import { supabase } from "../lib/supabase"
import type {
  Cliente,
  EliminarPedidoAdminResult,
  Pedido,
  PedidoDetalle,
} from "../types/database"

type OrderWithClient = Pedido & {
  clientes: Pick<Cliente, "nombre" | "notas_entrega"> | null
  pedido_detalles: Pick<PedidoDetalle, "producto_nombre" | "cantidad" | "variante_3_4">[] | null
}

type MonitorView = "active" | "history"

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

const HISTORY_ORDER_STATUSES = [
  "entregado",
  "finalizado",
  "completado",
  "cancelado",
  "rechazado",
  "devuelto",
]

function formatOrderType(tipoPedido: Pedido["tipo_pedido"]) {
  return tipoPedido === "domicilio" ? "Domicilio" : "Mostrador"
}

function formatPaymentMethod(metodoPago: Pedido["metodo_pago"]) {
  if (metodoPago === "transferencia") {
    return "Transferencia"
  }

  if (metodoPago === "efectivo") {
    return "Efectivo"
  }

  return "Sin definir"
}

function formatPaymentStatus(estadoPago: Pedido["estado_pago"]) {
  return estadoPago === "pagado" ? "Pagado" : "Pendiente"
}

function getShortOrderId(orderId: string) {
  return `#${orderId.slice(0, 8).toUpperCase()}`
}

function formatOrderDateTime(isoDateTime: Pedido["fecha_creacion"]) {
  if (!isoDateTime) {
    return "Sin fecha"
  }

  return formatDateTime(isoDateTime, {
    fallback: "Sin fecha",
  })
}

function formatOrderStatus(estado: Pedido["estado"]) {
  if (!estado) {
    return "Sin estado"
  }

  if (estado === "en_preparacion") {
    return "En preparacion"
  }

  if (estado === "en_camino") {
    return "En camino"
  }

  if (estado === "entregado") {
    return "Entregado"
  }

  return estado
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatVariantLabel(variante: PedidoDetalle["variante_3_4"]) {
  const sanitizedVariant = variante?.trim()

  if (!sanitizedVariant) {
    return null
  }

  if (sanitizedVariant === "3/4" || sanitizedVariant === "3-4") {
    return "3/4"
  }

  return sanitizedVariant.length > 14
    ? `${sanitizedVariant.slice(0, 14)}...`
    : sanitizedVariant
}

function formatOrderPackageSummary(order: OrderWithClient) {
  const details = order.pedido_detalles ?? []

  if (details.length === 0) {
    return "Sin productos"
  }

  const firstItem = details[0]
  const variantLabel = formatVariantLabel(firstItem.variante_3_4)
  const productName = firstItem.producto_nombre?.trim() || "Producto"
  const quantity = Number.isFinite(firstItem.cantidad)
    ? Math.max(1, firstItem.cantidad)
    : 1

  const firstItemSummary = `1 ${productName}${variantLabel ? ` (${variantLabel})` : ""} x${quantity}`
  const extraProductsCount = details.length - 1

  if (extraProductsCount <= 0) {
    return firstItemSummary
  }

  return `${firstItemSummary} +${extraProductsCount} productos`
}

function getStatusAction(order: OrderWithClient) {
  if (order.tipo_pedido === "mostrador") {
    return {
      label: "Entregar",
      nextState: "entregado" as const,
    }
  }

  return {
    label: "Enviar con Repartidor",
    nextState: "en_camino" as const,
  }
}

export function OrdersMonitor() {
  const [activeOrders, setActiveOrders] = useState<OrderWithClient[]>([])
  const [historyOrders, setHistoryOrders] = useState<OrderWithClient[]>([])
  const [view, setView] = useState<MonitorView>("active")
  const [isLoadingActive, setIsLoadingActive] = useState(true)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null)
  const [openActionsMenuOrderId, setOpenActionsMenuOrderId] = useState<string | null>(null)
  const [adminAccess, setAdminAccess] = useState<AdminAccess>(DEFAULT_ACCESS)

  async function refreshAdminAccess() {
    try {
      const nextAccess = await getAdminAccess()
      setAdminAccess(nextAccess)
    } catch (error) {
      console.error("Error al validar acceso admin:", error)
      setAdminAccess(DEFAULT_ACCESS)
    }
  }

  async function loadActiveOrders(showLoader = true) {
    try {
      if (showLoader) {
        setIsLoadingActive(true)
      }

      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "*, clientes(nombre, notas_entrega), pedido_detalles(producto_nombre, cantidad, variante_3_4)",
        )
        .neq("estado", "entregado")
        .order("fecha_creacion", { ascending: true })
        .order("creado_en", { ascending: true, foreignTable: "pedido_detalles" })

      if (error) {
        throw error
      }

      setActiveOrders((data ?? []) as OrderWithClient[])
    } catch (error) {
      console.error("Error al cargar pedidos activos:", error)
      toast.error("No se pudieron cargar los pedidos activos")
    } finally {
      if (showLoader) {
        setIsLoadingActive(false)
      }
    }
  }

  async function loadHistoryOrders(showLoader = true) {
    try {
      if (showLoader) {
        setIsLoadingHistory(true)
      }

      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "*, clientes(nombre, notas_entrega), pedido_detalles(producto_nombre, cantidad, variante_3_4)",
        )
        .in("estado", HISTORY_ORDER_STATUSES)
        .order("fecha_creacion", { ascending: false })
        .order("creado_en", { ascending: true, foreignTable: "pedido_detalles" })

      if (error) {
        throw error
      }

      setHistoryOrders((data ?? []) as OrderWithClient[])
    } catch (error) {
      console.error("Error al cargar pedidos historicos:", error)
      toast.error("No se pudieron cargar los pedidos historicos")
    } finally {
      if (showLoader) {
        setIsLoadingHistory(false)
      }
    }
  }

  useEffect(() => {
    void Promise.all([loadActiveOrders(), loadHistoryOrders()])
    void refreshAdminAccess()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshAdminAccess()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    setOpenActionsMenuOrderId(null)
  }, [view])

  useEffect(() => {
    if (!openActionsMenuOrderId) {
      return
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null

      if (!target) {
        return
      }

      const clickedMenu = target.closest(`[data-actions-menu-root="${openActionsMenuOrderId}"]`)
      const clickedTrigger = target.closest(
        `[data-actions-menu-trigger="${openActionsMenuOrderId}"]`,
      )

      if (!clickedMenu && !clickedTrigger) {
        setOpenActionsMenuOrderId(null)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenActionsMenuOrderId(null)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [openActionsMenuOrderId])

  async function handleMarkPaid(order: OrderWithClient) {
    if (order.estado_pago === "pagado") {
      return
    }

    try {
      setProcessingOrderId(order.id)

      const { error } = await supabase
        .from("pedidos")
        .update({ estado_pago: "pagado" })
        .eq("id", order.id)

      if (error) {
        throw error
      }

      await Promise.all([loadActiveOrders(false), loadHistoryOrders(false)])
      toast.success("Pago marcado como pagado")
    } catch (error) {
      console.error("Error al actualizar el pago:", error)
      toast.error("No se pudo actualizar el pago")
    } finally {
      setProcessingOrderId(null)
    }
  }

  async function handleAdvanceOrder(order: OrderWithClient) {
    const statusAction = getStatusAction(order)

    try {
      setProcessingOrderId(order.id)

      const updatePayload: { estado: Pedido["estado"]; estado_pago?: Pedido["estado_pago"] } = {
        estado: statusAction.nextState,
        ...(statusAction.nextState === "entregado"
          ? { estado_pago: "pagado" }
          : {}),
      }

      const { error } = await supabase
        .from("pedidos")
        .update(updatePayload)
        .eq("id", order.id)

      if (error) {
        throw error
      }

      if (statusAction.nextState === "en_camino") {
        const pushResult = await sendDispatchPushNotification({
          title: "Nuevo pedido en camino",
          body:
            order.tipo_pedido === "domicilio"
              ? `${order.clientes?.nombre ?? "Cliente"} - ${currencyFormatter.format(order.total)}`
              : `Pedido ${getShortOrderId(order.id)} listo para reparto`,
          data: {
            pedidoId: order.id,
            tipoPedido: order.tipo_pedido,
          },
        })

        if (!pushResult.delivered) {
          toast("Pedido enviado, pero no hay dispositivo registrado para push", {
            icon: "i",
          })
        }
      }

      await Promise.all([loadActiveOrders(false), loadHistoryOrders(false)])
      toast.success(
        statusAction.nextState === "entregado"
          ? "Pedido entregado"
          : "Pedido enviado con repartidor",
      )
    } catch (error) {
      console.error("Error al actualizar el pedido:", error)
      toast.error("No se pudo actualizar el pedido")
    } finally {
      setProcessingOrderId(null)
    }
  }

  async function handleDeleteOrder(order: OrderWithClient, sourceView: MonitorView) {
    if (!adminAccess.isAuthenticated) {
      toast.error("Debes iniciar sesion como administrador")
      return
    }

    if (!adminAccess.isAdmin) {
      toast.error("Solo un administrador puede eliminar pedidos")
      return
    }

    const confirmed = window.confirm(
      `Se eliminara el pedido ${getShortOrderId(order.id)}. El sistema intentara revertir inventario y, si no es posible, eliminara con motivo explicito. Deseas continuar?`,
    )

    if (!confirmed) {
      return
    }

    try {
      setProcessingOrderId(order.id)

      const { data, error } = await supabase.rpc("eliminar_pedido_admin", {
        p_pedido_id: order.id,
      })

      if (error) {
        throw error
      }

      const result = data as EliminarPedidoAdminResult | null

      if (!result?.ok) {
        throw new Error("No se pudo eliminar el pedido")
      }

      await Promise.all([loadActiveOrders(false), loadHistoryOrders(false)])

      if (result?.reversion_inventario_aplicada === false) {
        const reason =
          result?.motivo_reversion_inventario ||
          "No se encontro inventario compatible para reversa"
        toast(`Pedido eliminado sin reversa de inventario: ${reason}`, {
          icon: "!",
        })
      } else {
        toast.success(
          sourceView === "history"
            ? "Pedido historico eliminado"
            : "Pedido eliminado",
        )
      }
    } catch (error) {
      console.error("Error al eliminar el pedido:", error)
      toast.error("No se pudo eliminar el pedido")
    } finally {
      setProcessingOrderId(null)
    }
  }

  const isLoading = view === "active" ? isLoadingActive : isLoadingHistory
  const ordersToRender = view === "active" ? activeOrders : historyOrders

  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Operacion
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
            {view === "active" ? "Pedidos activos" : "Historial de pedidos"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {view === "active"
              ? "Monitorea pagos y avanza el estado de cada pedido en tiempo real."
              : "Consulta ventas finalizadas con datos clave de auditoria."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setView("active")}
              className={`rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${
                view === "active"
                  ? "bg-slate-900 text-white shadow-[0_8px_20px_rgba(15,23,42,0.16)]"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              Activos
            </button>
            <button
              type="button"
              onClick={() => setView("history")}
              className={`rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${
                view === "history"
                  ? "bg-slate-900 text-white shadow-[0_8px_20px_rgba(15,23,42,0.16)]"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              Historial
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              void (view === "active" ? loadActiveOrders() : loadHistoryOrders())
            }
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100"
          >
            Recargar pedidos
          </button>
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm font-medium text-slate-500">
            {view === "active"
              ? "Cargando pedidos activos..."
              : "Cargando historial de pedidos..."}
          </div>
        ) : ordersToRender.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm font-medium text-slate-500">
            {view === "active"
              ? "No hay pedidos activos pendientes de entrega."
              : "No hay pedidos historicos para mostrar."}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ordersToRender.map((order) => {
              const statusAction = getStatusAction(order)
              const isProcessing = processingOrderId === order.id
              const paymentStatusClasses =
                order.estado_pago === "pagado"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-rose-50 text-rose-700 ring-rose-200"
              const customerName =
                order.tipo_pedido === "domicilio"
                  ? order.clientes?.nombre ?? "Cliente sin nombre"
                  : "Mostrador"
              const packageSummary = formatOrderPackageSummary(order)
              const deliveryNotes =
                order.clientes?.notas_entrega?.trim() ||
                "Sin direccion o referencias registradas"

              return (
                <article
                  key={order.id}
                  className="rounded-[1.35rem] border border-slate-200 bg-slate-50/90 p-3 shadow-sm sm:p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      {getShortOrderId(order.id)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ring-1 ${paymentStatusClasses}`}
                      >
                        {formatPaymentStatus(order.estado_pago)}
                      </span>

                      {view === "active" && adminAccess.isAdmin ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenActionsMenuOrderId((currentId) =>
                                currentId === order.id ? null : order.id,
                              )
                            }
                            disabled={isProcessing}
                            aria-label={`Abrir acciones del pedido ${getShortOrderId(order.id)}`}
                            data-actions-menu-trigger={order.id}
                            className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-base font-black leading-none text-slate-600 transition hover:border-slate-300 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            ...
                          </button>

                          {openActionsMenuOrderId === order.id ? (
                            <div
                              data-actions-menu-root={order.id}
                              className="absolute right-0 top-9 z-20 min-w-[11rem] rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_36px_rgba(15,23,42,0.16)]"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionsMenuOrderId(null)
                                  void handleDeleteOrder(order, view)
                                }}
                                disabled={isProcessing}
                                aria-label={`Eliminar pedido ${getShortOrderId(order.id)}`}
                                className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:text-slate-400"
                              >
                                Eliminar pedido
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <h3 className="mt-1.5 text-[15px] font-bold text-slate-900">
                    {customerName}
                  </h3>

                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div className="col-span-2 min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Fecha
                      </dt>
                      <dd className="mt-0.5 truncate text-[13px] font-semibold text-slate-900">
                        {formatOrderDateTime(order.fecha_creacion)}
                      </dd>
                    </div>

                    <div className="col-span-2 min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Paquete
                      </dt>
                      <dd className="mt-0.5 overflow-hidden text-[12px] font-semibold leading-4 text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                        {packageSummary}
                      </dd>
                    </div>

                    <div className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Tipo
                      </dt>
                      <dd className="mt-0.5 truncate font-semibold text-slate-900">
                        {formatOrderType(order.tipo_pedido)}
                      </dd>
                    </div>

                    <div className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Total
                      </dt>
                      <dd className="mt-0.5 truncate text-[14px] font-black text-slate-900">
                        {currencyFormatter.format(order.total)}
                      </dd>
                    </div>

                    <div className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Metodo
                      </dt>
                      <dd className="mt-0.5 truncate font-semibold text-slate-900">
                        {formatPaymentMethod(order.metodo_pago)}
                      </dd>
                    </div>

                    {view === "history" ? (
                      <div className="min-w-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Estado pago
                        </dt>
                        <dd
                          className={`mt-0.5 truncate font-semibold ${
                            order.estado_pago === "pagado"
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {formatPaymentStatus(order.estado_pago)}
                        </dd>
                      </div>
                    ) : null}

                    {view === "history" ? (
                      <div className="col-span-2 min-w-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Estado pedido
                        </dt>
                        <dd className="mt-0.5 truncate font-semibold text-slate-900">
                          {formatOrderStatus(order.estado)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {order.tipo_pedido === "domicilio" ? (
                    <div className="mt-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Direccion
                      </p>
                      <p className="mt-0.5 overflow-hidden text-[12px] leading-4 text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                        {deliveryNotes}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {view === "active" ? (
                      <>
                        {order.estado_pago === "pendiente" ? (
                          <button
                            type="button"
                            onClick={() => void handleMarkPaid(order)}
                            disabled={isProcessing}
                            className="min-w-0 flex-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            Marcar pagado
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => void handleAdvanceOrder(order)}
                          disabled={isProcessing}
                          className={`min-w-0 rounded-2xl bg-slate-900 px-3 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_25px_rgba(15,23,42,0.16)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none ${
                            order.estado_pago === "pendiente" ? "flex-1" : "w-full"
                          }`}
                        >
                          {statusAction.label}
                        </button>
                      </>
                    ) : null}

                    {adminAccess.isAdmin && view === "history" ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteOrder(order, view)}
                        disabled={isProcessing}
                        className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {view === "history" ? "Eliminar registro" : "Eliminar pedido"}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export default OrdersMonitor
