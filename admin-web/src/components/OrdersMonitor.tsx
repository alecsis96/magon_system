import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import { sendDispatchPushNotification } from "../lib/push"
import { supabase } from "../lib/supabase"
import type { Cliente, EliminarPedidoAdminResult, Pedido } from "../types/database"

type ActiveOrder = Pedido & {
  clientes: Pick<Cliente, "nombre" | "notas_entrega"> | null
}

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

function getStatusAction(order: ActiveOrder) {
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
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null)
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

  async function loadActiveOrders() {
    try {
      setIsLoading(true)

      const { data, error } = await supabase
        .from("pedidos")
        .select("*, clientes(nombre, notas_entrega)")
        .neq("estado", "entregado")
        .order("fecha_creacion", { ascending: true })

      if (error) {
        throw error
      }

      setActiveOrders((data ?? []) as ActiveOrder[])
    } catch (error) {
      console.error("Error al cargar pedidos activos:", error)
      toast.error("No se pudieron cargar los pedidos activos")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadActiveOrders()
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

  async function handleMarkPaid(order: ActiveOrder) {
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

      await loadActiveOrders()
      toast.success("Pago marcado como pagado")
    } catch (error) {
      console.error("Error al actualizar el pago:", error)
      toast.error("No se pudo actualizar el pago")
    } finally {
      setProcessingOrderId(null)
    }
  }

  async function handleAdvanceOrder(order: ActiveOrder) {
    const statusAction = getStatusAction(order)

    try {
      setProcessingOrderId(order.id)

      const { error } = await supabase
        .from("pedidos")
        .update({ estado: statusAction.nextState })
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

      await loadActiveOrders()
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

  async function handleDeleteOrder(order: ActiveOrder) {
    if (!adminAccess.isAuthenticated) {
      toast.error("Debes iniciar sesion como administrador")
      return
    }

    if (!adminAccess.isAdmin) {
      toast.error("Solo un administrador puede eliminar pedidos")
      return
    }

    const confirmed = window.confirm(
      `Se eliminara el pedido ${getShortOrderId(order.id)} y se revertira su impacto en inventario. Deseas continuar?`,
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

      await loadActiveOrders()
      toast.success("Pedido eliminado")
    } catch (error) {
      console.error("Error al eliminar el pedido:", error)
      toast.error("No se pudo eliminar el pedido")
    } finally {
      setProcessingOrderId(null)
    }
  }

  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Operacion
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
            Pedidos activos
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Monitorea pagos y avanza el estado de cada pedido en tiempo real.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadActiveOrders()}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100"
        >
          Recargar pedidos
        </button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm font-medium text-slate-500">
            Cargando pedidos activos...
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm font-medium text-slate-500">
            No hay pedidos activos pendientes de entrega.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeOrders.map((order) => {
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
              const deliveryNotes =
                order.clientes?.notas_entrega?.trim() ||
                "Sin direccion o referencias registradas"

              return (
                <article
                  key={order.id}
                  className="rounded-[1.6rem] border border-slate-200 bg-slate-50/90 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      {getShortOrderId(order.id)}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ring-1 ${paymentStatusClasses}`}
                    >
                      {formatPaymentStatus(order.estado_pago)}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900">
                    {customerName}
                  </h3>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
                      <dd className="mt-0.5 truncate text-sm font-black text-slate-900">
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

                    <div className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Estado
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
                  </dl>

                  {order.tipo_pedido === "domicilio" ? (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Direccion
                      </p>
                      <p className="mt-1 overflow-hidden text-xs leading-5 text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                        {deliveryNotes}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleMarkPaid(order)}
                      disabled={isProcessing || order.estado_pago === "pagado"}
                      className="min-w-0 flex-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {order.estado_pago === "pendiente"
                        ? "Marcar pagado"
                        : "Pago confirmado"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleAdvanceOrder(order)}
                      disabled={isProcessing}
                      className="min-w-0 flex-1 rounded-2xl bg-slate-900 px-3 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_25px_rgba(15,23,42,0.16)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                    >
                      {statusAction.label}
                    </button>

                    {adminAccess.isAdmin ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteOrder(order)}
                        disabled={isProcessing}
                        className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Eliminar pedido
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
