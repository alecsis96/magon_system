import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { sendDispatchPushNotification } from "../lib/push"
import { supabase } from "../lib/supabase"
import type { Cliente, Pedido } from "../types/database"

type ActiveOrder = Pedido & {
  clientes: Pick<Cliente, "nombre" | "notas_entrega"> | null
}

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

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
              ? `${order.clientes?.nombre ?? "Cliente"} · ${currencyFormatter.format(order.total)}`
              : `Pedido ${getShortOrderId(order.id)} listo para reparto`,
          data: {
            pedidoId: order.id,
            tipoPedido: order.tipo_pedido,
          },
        })

        if (!pushResult.delivered) {
          toast("Pedido enviado, pero no hay dispositivo registrado para push", {
            icon: "ℹ️",
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeOrders.map((order) => {
              const statusAction = getStatusAction(order)
              const isProcessing = processingOrderId === order.id
              const paymentStatusClasses =
                order.estado_pago === "pagado"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-rose-50 text-rose-700 ring-rose-200"

              return (
                <article
                  key={order.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {getShortOrderId(order.id)}
                      </p>
                      <h3 className="mt-2 text-xl font-black text-slate-900">
                        {order.tipo_pedido === "domicilio"
                          ? order.clientes?.nombre ?? "Cliente sin nombre"
                          : "Mostrador"}
                      </h3>
                    </div>

                    <span
                      className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] ring-1 ${paymentStatusClasses}`}
                    >
                      {formatPaymentStatus(order.estado_pago)}
                    </span>
                  </div>

                  <dl className="mt-5 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                      <dt className="font-semibold text-slate-500">Tipo</dt>
                      <dd className="font-bold text-slate-900">
                        {formatOrderType(order.tipo_pedido)}
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                      <dt className="font-semibold text-slate-500">Cliente</dt>
                      <dd className="font-bold text-slate-900">
                        {order.tipo_pedido === "domicilio"
                          ? order.clientes?.nombre ?? "Cliente sin nombre"
                          : "Mostrador"}
                      </dd>
                    </div>

                    {order.tipo_pedido === "domicilio" ? (
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <dt className="font-semibold text-slate-500">
                          Direccion / referencias
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-slate-900">
                          {order.clientes?.notas_entrega?.trim() ||
                            "Sin direccion o referencias registradas"}
                        </dd>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                      <dt className="font-semibold text-slate-500">Total</dt>
                      <dd className="text-base font-black text-slate-900">
                        {currencyFormatter.format(order.total)}
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                      <dt className="font-semibold text-slate-500">
                        Metodo pago
                      </dt>
                      <dd className="font-bold text-slate-900">
                        {formatPaymentMethod(order.metodo_pago)}
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                      <dt className="font-semibold text-slate-500">
                        Estado pago
                      </dt>
                      <dd
                        className={`font-bold ${
                          order.estado_pago === "pagado"
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {formatPaymentStatus(order.estado_pago)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 grid gap-3">
                    <button
                      type="button"
                      onClick={() => void handleMarkPaid(order)}
                      disabled={isProcessing || order.estado_pago === "pagado"}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {order.estado_pago === "pendiente"
                        ? "Marcar Pagado"
                        : "Pago Confirmado"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleAdvanceOrder(order)}
                      disabled={isProcessing}
                      className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(15,23,42,0.16)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                    >
                      {statusAction.label}
                    </button>
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
