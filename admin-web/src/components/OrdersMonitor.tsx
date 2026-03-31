import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import { sendDispatchPushNotification } from "../lib/push"
import { supabase } from "../lib/supabase"
import type { Cliente, Pedido, PedidoDetalle } from "../types/database"

type ActiveOrder = Pedido & {
  clientes: Pick<Cliente, "nombre" | "notas_entrega"> | null
}

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

const inventoryDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
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

function getOrderInventoryDate(fechaCreacion: string | null) {
  if (!fechaCreacion) {
    return inventoryDateFormatter.format(new Date())
  }

  const parsedDate = fechaCreacion.endsWith("Z")
    ? new Date(fechaCreacion)
    : new Date(`${fechaCreacion}Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return inventoryDateFormatter.format(new Date())
  }

  return inventoryDateFormatter.format(parsedDate)
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

      const { data: detallesData, error: detallesError } = await supabase
        .from("pedido_detalles")
        .select(
          "id, pedido_id, alas, piernas, muslos, pechugas_grandes, pechugas_chicas, merma_alas, merma_piernas, merma_muslos, merma_pechugas_grandes, merma_pechugas_chicas",
        )
        .eq("pedido_id", order.id)

      if (detallesError) {
        throw detallesError
      }

      const detalles = (detallesData ?? []) as Pick<
        PedidoDetalle,
        | "id"
        | "pedido_id"
        | "alas"
        | "piernas"
        | "muslos"
        | "pechugas_grandes"
        | "pechugas_chicas"
        | "merma_alas"
        | "merma_piernas"
        | "merma_muslos"
        | "merma_pechugas_grandes"
        | "merma_pechugas_chicas"
      >[]

      if (detalles.length > 0) {
        const soldBreakdown = detalles.reduce(
          (acc, detail) => ({
            alas: acc.alas + (detail.alas ?? 0),
            piernas: acc.piernas + (detail.piernas ?? 0),
            muslos: acc.muslos + (detail.muslos ?? 0),
            pechugas_grandes:
              acc.pechugas_grandes + (detail.pechugas_grandes ?? 0),
            pechugas_chicas:
              acc.pechugas_chicas + (detail.pechugas_chicas ?? 0),
            merma_alas: acc.merma_alas + (detail.merma_alas ?? 0),
            merma_piernas: acc.merma_piernas + (detail.merma_piernas ?? 0),
            merma_muslos: acc.merma_muslos + (detail.merma_muslos ?? 0),
            merma_pechugas_grandes:
              acc.merma_pechugas_grandes + (detail.merma_pechugas_grandes ?? 0),
            merma_pechugas_chicas:
              acc.merma_pechugas_chicas + (detail.merma_pechugas_chicas ?? 0),
          }),
          {
            alas: 0,
            piernas: 0,
            muslos: 0,
            pechugas_grandes: 0,
            pechugas_chicas: 0,
            merma_alas: 0,
            merma_piernas: 0,
            merma_muslos: 0,
            merma_pechugas_grandes: 0,
            merma_pechugas_chicas: 0,
          },
        )

        const piezasVendidas =
          soldBreakdown.alas +
          soldBreakdown.piernas +
          soldBreakdown.muslos +
          soldBreakdown.pechugas_grandes +
          soldBreakdown.pechugas_chicas
        const mermasQuemadas =
          soldBreakdown.merma_alas +
          soldBreakdown.merma_piernas +
          soldBreakdown.merma_muslos +
          soldBreakdown.merma_pechugas_grandes +
          soldBreakdown.merma_pechugas_chicas
        const inventoryDate = getOrderInventoryDate(order.fecha_creacion)

        const { data: inventoryData, error: inventoryError } = await supabase
          .from("inventario_diario")
          .select(
            "id, pollos_vendidos, ventas_alas, ventas_piernas, ventas_muslos, ventas_pechugas_g, ventas_pechugas_c, mermas_quemados, mermas_alas, mermas_piernas, mermas_muslos, mermas_pechugas_g, mermas_pechugas_c",
          )
          .eq("fecha", inventoryDate)
          .maybeSingle()

        if (inventoryError) {
          throw inventoryError
        }

        if (!inventoryData) {
          throw new Error("No se encontro el inventario del dia para revertir el pedido")
        }

        const { error: inventoryUpdateError } = await supabase
          .from("inventario_diario")
          .update({
            pollos_vendidos: Math.max(
              0,
              (inventoryData.pollos_vendidos ?? 0) - piezasVendidas,
            ),
            ventas_alas: Math.max(
              0,
              (inventoryData.ventas_alas ?? 0) - soldBreakdown.alas,
            ),
            ventas_piernas: Math.max(
              0,
              (inventoryData.ventas_piernas ?? 0) - soldBreakdown.piernas,
            ),
            ventas_muslos: Math.max(
              0,
              (inventoryData.ventas_muslos ?? 0) - soldBreakdown.muslos,
            ),
            ventas_pechugas_g: Math.max(
              0,
              (inventoryData.ventas_pechugas_g ?? 0) -
                soldBreakdown.pechugas_grandes,
            ),
            ventas_pechugas_c: Math.max(
              0,
              (inventoryData.ventas_pechugas_c ?? 0) -
                soldBreakdown.pechugas_chicas,
            ),
            mermas_quemados: Math.max(
              0,
              (inventoryData.mermas_quemados ?? 0) - mermasQuemadas,
            ),
            mermas_alas: Math.max(
              0,
              (inventoryData.mermas_alas ?? 0) - soldBreakdown.merma_alas,
            ),
            mermas_piernas: Math.max(
              0,
              (inventoryData.mermas_piernas ?? 0) - soldBreakdown.merma_piernas,
            ),
            mermas_muslos: Math.max(
              0,
              (inventoryData.mermas_muslos ?? 0) - soldBreakdown.merma_muslos,
            ),
            mermas_pechugas_g: Math.max(
              0,
              (inventoryData.mermas_pechugas_g ?? 0) -
                soldBreakdown.merma_pechugas_grandes,
            ),
            mermas_pechugas_c: Math.max(
              0,
              (inventoryData.mermas_pechugas_c ?? 0) -
                soldBreakdown.merma_pechugas_chicas,
            ),
          })
          .eq("id", inventoryData.id)

        if (inventoryUpdateError) {
          throw inventoryUpdateError
        }
      }

      const { error: deleteDetailsError } = await supabase
        .from("pedido_detalles")
        .delete()
        .eq("pedido_id", order.id)

      if (deleteDetailsError) {
        throw deleteDetailsError
      }

      const { error: deleteOrderError } = await supabase
        .from("pedidos")
        .delete()
        .eq("id", order.id)

      if (deleteOrderError) {
        throw deleteOrderError
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
