import { useEffect, useMemo, useState } from "react"
import { toast } from "react-hot-toast"
import { ejecutarImpresionBluetooth, generarTextoTicket } from "../lib/printing"
import type { PrintableOrder } from "../lib/printing"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import { registrarEventoAuditoriaBestEffort } from "../lib/audit"
import { formatDateTime } from "../lib/datetime"
import {
  mapPedidoDetalleToCorrectionDraftDetail,
  saveOrderCorrectionDraftToStorage,
} from "../lib/orderCorrectionDraft"
import { sendDispatchPushNotification } from "../lib/push"
import { supabase } from "../lib/supabase"
import type {
  CancelarPedidoParaCorreccionResult,
  CancelarPedidoParaCorreccionSupervisadaResult,
  CancelarPedidoEmpleadoResult,
  Cliente,
  EliminarPedidoAdminResult,
  Pedido,
  PedidoDetalle,
} from "../types/database"

type OrderWithClient = Pedido & {
  clientes: Pick<
    Cliente,
    "nombre" | "telefono" | "direccion_habitual" | "referencias" | "notas_entrega"
  > | null
  pedido_detalles: Pick<
    PedidoDetalle,
    | "producto_id"
    | "producto_codigo"
    | "producto_nombre"
    | "descripcion"
    | "cantidad"
    | "precio_unitario"
    | "subtotal"
    | "variante_3_4"
    | "merma_descripcion"
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
  >[] | null
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

function isHistoryOrderStatus(estado: Pedido["estado"]) {
  const normalizedStatus = estado?.trim().toLowerCase() ?? ""
  return HISTORY_ORDER_STATUSES.includes(normalizedStatus)
}

function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function getDayFilterBounds(selectedDate: string) {
  const fallbackDate = getLocalDateInputValue()
  const normalizedDate = selectedDate || fallbackDate
  const [year, month, day] = normalizedDate.split("-").map((part) => Number.parseInt(part, 10))

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return getDayFilterBounds(fallbackDate)
  }

  const startOfSelectedDay = new Date(year, month - 1, day)
  startOfSelectedDay.setHours(0, 0, 0, 0)

  const endOfSelectedDay = new Date(startOfSelectedDay)
  endOfSelectedDay.setHours(23, 59, 59, 999)

  return {
    from: startOfSelectedDay.toISOString(),
    to: endOfSelectedDay.toISOString(),
  }
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

function getPaymentMethodMeta(metodoPago: Pedido["metodo_pago"]) {
  if (metodoPago === "transferencia") {
    return {
      label: "Transferencia",
      icon: "transferencia" as const,
    }
  }

  if (metodoPago === "efectivo") {
    return {
      label: "Efectivo",
      icon: "efectivo" as const,
    }
  }

  return {
    label: "Sin definir",
    icon: "sin_definir" as const,
  }
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

function isEffectivelyPaidOrder(order: Pedido) {
  return (
    order.estado_pago === "pagado" ||
    order.estado === "entregado" ||
    order.tipo_pedido === "mostrador"
  )
}

function canCancelOrder(order: OrderWithClient) {
  return !isHistoryOrderStatus(order.estado)
}

function canSupervisedCorrectHistoryOrder(order: OrderWithClient) {
  return (order.estado?.trim().toLowerCase() ?? "") === "entregado"
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message

    if (typeof message === "string" && message.trim()) {
      return message
    }
  }

  return "No se pudo completar la operacion"
}

function isMissingSupervisedCorrectionRpcError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false
  }

  const code = "code" in error ? String(error.code ?? "") : ""
  const message = getErrorMessage(error).toLowerCase()

  return (
    code === "PGRST202" ||
    code === "42883" ||
    message.includes("cancelar_pedido_para_correccion_supervisada") ||
    message.includes("could not find the function") ||
    message.includes("function") && message.includes("does not exist")
  )
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

function getOrderSoldPieces(order: OrderWithClient) {
  return (order.pedido_detalles ?? []).reduce((orderSum, detail) => {
    const pieceFields = [
      detail.alas,
      detail.piernas,
      detail.muslos,
      detail.pechugas_grandes,
      detail.pechugas_chicas,
    ]

    const hasAnyPieceField = pieceFields.some((value) => Number.isFinite(value) && value > 0)
    const detailPieces = hasAnyPieceField
      ? pieceFields.reduce(
          (detailSum, value) => detailSum + (Number.isFinite(value) ? Math.max(0, value) : 0),
          0,
        )
      : Number.isFinite(detail.cantidad)
        ? Math.max(0, detail.cantidad)
        : 0

    return orderSum + detailPieces
  }, 0)
}

function getStatusAction(order: OrderWithClient) {
  if (order.tipo_pedido !== "domicilio") {
    return null
  }

  return {
    label: "Enviar con Repartidor",
    nextState: "en_camino" as const,
  }
}

type OrdersMonitorProps = {
  onStartCorrection?: () => void
}

export function OrdersMonitor({ onStartCorrection }: OrdersMonitorProps) {
  const [activeOrders, setActiveOrders] = useState<OrderWithClient[]>([])
  const [historyOrders, setHistoryOrders] = useState<OrderWithClient[]>([])
  const [view, setView] = useState<MonitorView>("active")
  const [isLoadingActive, setIsLoadingActive] = useState(true)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null)
  const [openActionsMenuOrderId, setOpenActionsMenuOrderId] = useState<string | null>(null)
  const [adminAccess, setAdminAccess] = useState<AdminAccess>(DEFAULT_ACCESS)
  const [historyDate, setHistoryDate] = useState(getLocalDateInputValue)
  const [todayDashboardOrders, setTodayDashboardOrders] = useState<OrderWithClient[]>([])

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
          "*, clientes(nombre, telefono, direccion_habitual, referencias, notas_entrega), pedido_detalles(producto_id, producto_codigo, producto_nombre, descripcion, cantidad, precio_unitario, subtotal, variante_3_4, merma_descripcion, alas, piernas, muslos, pechugas_grandes, pechugas_chicas, merma_alas, merma_piernas, merma_muslos, merma_pechugas_grandes, merma_pechugas_chicas)",
        )
        .order("fecha_creacion", { ascending: true })
        .order("creado_en", { ascending: true, foreignTable: "pedido_detalles" })

      if (error) {
        throw error
      }

      const nextOrders = ((data ?? []) as OrderWithClient[]).filter(
        (order) => !isHistoryOrderStatus(order.estado),
      )

      setActiveOrders(nextOrders)
    } catch (error) {
      console.error("Error al cargar pedidos activos:", error)
      toast.error("No se pudieron cargar los pedidos activos")
    } finally {
      if (showLoader) {
        setIsLoadingActive(false)
      }
    }
  }

  async function loadHistoryOrders(
    showLoader = true,
    selectedDate = historyDate,
  ) {
    try {
      if (showLoader) {
        setIsLoadingHistory(true)
      }

      const { from, to } = getDayFilterBounds(selectedDate)

      let historyQuery = supabase
        .from("pedidos")
        .select(
          "*, clientes(nombre, telefono, direccion_habitual, referencias, notas_entrega), pedido_detalles(producto_id, producto_codigo, producto_nombre, descripcion, cantidad, precio_unitario, subtotal, variante_3_4, merma_descripcion, alas, piernas, muslos, pechugas_grandes, pechugas_chicas, merma_alas, merma_piernas, merma_muslos, merma_pechugas_grandes, merma_pechugas_chicas)",
        )
        .in("estado", HISTORY_ORDER_STATUSES)

      if (from) {
        historyQuery = historyQuery.gte("fecha_creacion", from)
      }

      if (to) {
        historyQuery = historyQuery.lte("fecha_creacion", to)
      }

      const { data, error } = await historyQuery
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

  async function loadTodayDashboardOrders() {
    try {
      const now = new Date()
      const startOfToday = new Date(now)
      startOfToday.setHours(0, 0, 0, 0)

      const endOfToday = new Date(startOfToday)
      endOfToday.setHours(23, 59, 59, 999)

      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "*, clientes(nombre, telefono, direccion_habitual, referencias, notas_entrega), pedido_detalles(producto_id, producto_codigo, producto_nombre, descripcion, cantidad, precio_unitario, subtotal, variante_3_4, merma_descripcion, alas, piernas, muslos, pechugas_grandes, pechugas_chicas, merma_alas, merma_piernas, merma_muslos, merma_pechugas_grandes, merma_pechugas_chicas)",
        )
        .gte("fecha_creacion", startOfToday.toISOString())
        .lte("fecha_creacion", endOfToday.toISOString())
        .order("fecha_creacion", { ascending: false })
        .order("creado_en", { ascending: true, foreignTable: "pedido_detalles" })

      if (error) {
        throw error
      }

      setTodayDashboardOrders((data ?? []) as OrderWithClient[])
    } catch (error) {
      console.error("Error al cargar tablero operativo:", error)
    }
  }

  useEffect(() => {
    void Promise.all([loadActiveOrders(), loadHistoryOrders(), loadTodayDashboardOrders()])
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
    if (historyDate) {
      void loadHistoryOrders()
    }
  }, [historyDate])

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

      await Promise.all([
        loadActiveOrders(false),
        loadHistoryOrders(false),
        loadTodayDashboardOrders(),
      ])
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

    if (!statusAction) {
      return
    }

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

      await Promise.all([
        loadActiveOrders(false),
        loadHistoryOrders(false),
        loadTodayDashboardOrders(),
      ])
      toast.success("Pedido enviado con repartidor")
    } catch (error) {
      console.error("Error al actualizar el pedido:", error)
      toast.error("No se pudo actualizar el pedido")
    } finally {
      setProcessingOrderId(null)
    }
  }

  async function handleReprintTicket(order: OrderWithClient) {
    if (!adminAccess.isAuthenticated) {
      toast.error("Debes iniciar sesion para reimprimir tickets")
      return
    }

    try {
      setProcessingOrderId(order.id)

      const printableSupabase = supabase as typeof supabase & {
        rpc: {
          (
            fn: "get_printable_order",
            args: { p_pedido_id: string },
          ): Promise<{
            data: PrintableOrder | null
            error: Error | null
          }>
        }
      }

      const { data: printableOrder, error } = await printableSupabase.rpc(
        "get_printable_order",
        {
          p_pedido_id: order.id,
        },
      )

      if (error) {
        throw error
      }

      if (!printableOrder) {
        throw new Error("No se pudo recuperar el pedido para impresion")
      }

      const ticketCocina = generarTextoTicket(printableOrder, true)
      const ticketCliente = generarTextoTicket(printableOrder, false)

      ejecutarImpresionBluetooth(ticketCocina)
      window.setTimeout(() => {
        ejecutarImpresionBluetooth(ticketCliente)
      }, 4000)

      toast.success(`Ticket reenviado para ${getShortOrderId(order.id)}`)
    } catch (error) {
      console.error("Error al reimprimir ticket:", error)
      toast.error(
        error instanceof Error ? error.message : "No se pudo reimprimir el ticket",
      )
    } finally {
      setProcessingOrderId(null)
    }
  }

  async function handleRenotifyDispatch(order: OrderWithClient) {
    if (!adminAccess.isAuthenticated) {
      toast.error("Debes iniciar sesion para notificar al repartidor")
      return
    }

    if (order.tipo_pedido !== "domicilio") {
      toast.error("Solo los pedidos a domicilio se pueden volver a notificar")
      return
    }

    try {
      setProcessingOrderId(order.id)

      const pushResult = await sendDispatchPushNotification({
        title: "Nuevo pedido en camino",
        body: `${order.clientes?.nombre ?? "Cliente"} - ${currencyFormatter.format(order.total)}`,
        data: {
          pedidoId: order.id,
          tipoPedido: order.tipo_pedido,
        },
      })

      if (!pushResult.delivered) {
        toast("Pedido reenviado, pero no hay dispositivo registrado para push", {
          icon: "i",
        })
        return
      }

      toast.success("Notificacion reenviada al repartidor")
    } catch (error) {
      console.error("Error al reenviar notificacion al repartidor:", error)
      toast.error("No se pudo notificar al repartidor")
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

      await Promise.all([
        loadActiveOrders(false),
        loadHistoryOrders(false),
        loadTodayDashboardOrders(),
      ])

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

      void registrarEventoAuditoriaBestEffort({
        modulo: "pedidos",
        accion: "pedido_eliminado_admin",
        entidad: "pedidos",
        entidadId: order.id,
        detalle: {
          fuente: sourceView,
          tipo_pedido: order.tipo_pedido,
          total: order.total,
          estado_previo: order.estado,
          estado_pago_previo: order.estado_pago,
          cliente: order.clientes?.nombre ?? null,
          reversion_inventario_aplicada:
            result?.reversion_inventario_aplicada ?? true,
          motivo_reversion_inventario:
            result?.motivo_reversion_inventario ?? null,
        },
      })
    } catch (error) {
      console.error("Error al eliminar el pedido:", error)
      toast.error("No se pudo eliminar el pedido")
    } finally {
      setProcessingOrderId(null)
    }
  }

  async function handleCancelOrder(order: OrderWithClient) {
    if (!canCancelOrder(order)) {
      toast.error("Este pedido ya no se puede cancelar")
      return
    }

    const reason = window.prompt(
      `Motivo de cancelacion para ${getShortOrderId(order.id)}:`,
      order.motivo_cancelacion ?? "",
    )

    if (reason === null) {
      return
    }

    const trimmedReason = reason.trim()

    if (trimmedReason.length < 4) {
      toast.error("Escribe un motivo de al menos 4 caracteres")
      return
    }

    const confirmed = window.confirm(
      `Se cancelara el pedido ${getShortOrderId(order.id)} y se revertira inventario.\n\nMotivo: ${trimmedReason}`,
    )

    if (!confirmed) {
      return
    }

    try {
      setProcessingOrderId(order.id)

      const { data, error } = await supabase.rpc("cancelar_pedido_empleado", {
        p_pedido_id: order.id,
        p_motivo: trimmedReason,
      })

      if (error) {
        throw error
      }

      const result = data as CancelarPedidoEmpleadoResult | null

      if (!result?.ok || result.reversion_inventario_aplicada === false) {
        throw new Error(result?.motivo_reversion_inventario ?? "No se pudo cancelar el pedido")
      }

      await Promise.all([
        loadActiveOrders(false),
        loadHistoryOrders(false, historyDate),
        loadTodayDashboardOrders(),
      ])

      toast.success("Pedido cancelado")
    } catch (error) {
      console.error("Error al cancelar el pedido:", error)
      toast.error(
        error instanceof Error ? error.message : "No se pudo cancelar el pedido",
      )
    } finally {
      setProcessingOrderId(null)
    }
  }

  async function handleCorrectOrder(order: OrderWithClient) {
    if (!canCancelOrder(order)) {
      toast.error("Este pedido ya no se puede corregir")
      return
    }

    const confirmed = window.confirm(
      `Se cancelara el pedido ${getShortOrderId(order.id)} para corregirlo desde caja. Se revertira inventario y se cargara un borrador en POS.`,
    )

    if (!confirmed) {
      return
    }

    try {
      setProcessingOrderId(order.id)

      const { data, error } = await supabase.rpc("cancelar_pedido_para_correccion", {
        p_pedido_id: order.id,
        p_motivo: "correccion",
      })

      if (error) {
        throw error
      }

      const result = data as CancelarPedidoParaCorreccionResult | null

      if (!result?.ok || result.reversion_inventario_aplicada === false) {
        throw new Error(result?.motivo_reversion_inventario ?? "No se pudo corregir el pedido")
      }

      const details = (order.pedido_detalles ?? []).map((detail) =>
        mapPedidoDetalleToCorrectionDraftDetail(detail),
      )

      if (details.length === 0) {
        throw new Error("El pedido no tiene detalles para corregir")
      }

      saveOrderCorrectionDraftToStorage({
        original_pedido_id: order.id,
        short_order_id: getShortOrderId(order.id),
        created_at: new Date().toISOString(),
        original_fecha_creacion: order.fecha_creacion,
        tipo_pedido: order.tipo_pedido,
        metodo_pago: order.metodo_pago,
        estado_pago: order.estado_pago,
        customer: {
          id: order.cliente_id,
          nombre: order.clientes?.nombre ?? null,
          telefono: order.clientes?.telefono ?? null,
          direccion_habitual: order.clientes?.direccion_habitual ?? null,
          referencias: order.clientes?.referencias ?? null,
          notas_entrega: order.clientes?.notas_entrega ?? null,
        },
        notas: order.clientes?.notas_entrega ?? null,
        details,
      })

      await Promise.all([
        loadActiveOrders(false),
        loadHistoryOrders(false, historyDate),
        loadTodayDashboardOrders(),
      ])

      toast.success("Pedido listo para correccion en POS")
      onStartCorrection?.()
    } catch (error) {
      console.error("Error al preparar correccion:", error)
      toast.error(error instanceof Error ? error.message : "No se pudo corregir el pedido")
    } finally {
      setProcessingOrderId(null)
    }
  }

  async function handleSupervisedHistoryCorrection(order: OrderWithClient) {
    if (!adminAccess.isAuthenticated) {
      toast.error("Debes iniciar sesion como administrador")
      return
    }

    if (!adminAccess.isAdmin) {
      toast.error("Solo un administrador puede corregir pedidos entregados")
      return
    }

    const normalizedStatus = order.estado?.trim().toLowerCase() ?? ""
    const isDeliveredOrder = normalizedStatus === "entregado"

    if (!isDeliveredOrder) {
      toast.error("Este pedido no es elegible para correccion supervisada")
      return
    }

    const reason = window.prompt(
      `Motivo obligatorio para correccion supervisada de ${getShortOrderId(order.id)}:`,
      "",
    )

    if (reason === null) {
      return
    }

    const trimmedReason = reason.trim()

    if (trimmedReason.length < 4) {
      toast.error("Escribe un motivo de al menos 4 caracteres")
      return
    }

    const confirmed = window.confirm(
      `ADVERTENCIA: esta correccion supervisada cancelara el pedido entregado ${getShortOrderId(order.id)}.\n\nImpacto:\n- Revertira inventario historico del dia del pedido (con fallback seguro).\n- Afectara reportes historicos y trazabilidad de ventas.\n- Se registrara auditoria con el motivo indicado.\n\nMotivo: ${trimmedReason}\n\nDeseas continuar?`,
    )

    if (!confirmed) {
      return
    }

    try {
      setProcessingOrderId(order.id)

      let result: CancelarPedidoParaCorreccionSupervisadaResult | null = null

      const { data, error } = await supabase.rpc(
        "cancelar_pedido_para_correccion_supervisada",
        {
          p_pedido_id: order.id,
          p_motivo: trimmedReason,
        },
      )

      if (error) {
        if (!isMissingSupervisedCorrectionRpcError(error)) {
          throw error
        }

        if (isDeliveredOrder) {
          throw new Error(
            "Falta una migracion en la base de datos: no existe la RPC cancelar_pedido_para_correccion_supervisada. Ejecuta las migraciones pendientes para corregir pedidos entregados.",
          )
        }

        const fallback = await supabase.rpc("cancelar_pedido_para_correccion", {
          p_pedido_id: order.id,
          p_motivo: trimmedReason,
        })

        if (fallback.error) {
          throw fallback.error
        }

        const fallbackResult = fallback.data as CancelarPedidoParaCorreccionResult | null

        if (!fallbackResult?.ok) {
          throw new Error("No se pudo ejecutar la correccion con RPC de respaldo")
        }

        result = {
          ...fallbackResult,
          supervisada: false,
          ya_cancelado: false,
          estado_previo: order.estado ?? null,
        } as CancelarPedidoParaCorreccionSupervisadaResult
      } else {
        result = data as CancelarPedidoParaCorreccionSupervisadaResult | null
      }

      if (!result?.ok) {
        throw new Error("No se pudo ejecutar la correccion supervisada")
      }

      const details = (order.pedido_detalles ?? []).map((detail) =>
        mapPedidoDetalleToCorrectionDraftDetail(detail),
      )

      if (details.length === 0) {
        throw new Error("El pedido no tiene detalles para corregir")
      }

      saveOrderCorrectionDraftToStorage({
        original_pedido_id: order.id,
        short_order_id: getShortOrderId(order.id),
        created_at: new Date().toISOString(),
        original_fecha_creacion: order.fecha_creacion,
        tipo_pedido: order.tipo_pedido,
        metodo_pago: order.metodo_pago,
        estado_pago: order.estado_pago,
        customer: {
          id: order.cliente_id,
          nombre: order.clientes?.nombre ?? null,
          telefono: order.clientes?.telefono ?? null,
          direccion_habitual: order.clientes?.direccion_habitual ?? null,
          referencias: order.clientes?.referencias ?? null,
          notas_entrega: order.clientes?.notas_entrega ?? null,
        },
        notas: order.clientes?.notas_entrega ?? null,
        details,
      })

      await Promise.all([
        loadActiveOrders(false),
        loadHistoryOrders(false, historyDate),
        loadTodayDashboardOrders(),
      ])

      if (result.reversion_inventario_aplicada === false) {
        toast(
          `Pedido cancelado para correccion supervisada sin reversa de inventario: ${result.motivo_reversion_inventario ?? "Sin detalle"}`,
          { icon: "!" },
        )
      } else {
        toast.success("Pedido historico listo para correccion supervisada en POS")
      }

      onStartCorrection?.()
    } catch (error) {
      console.error("Error en correccion supervisada:", error)
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo preparar la correccion supervisada",
      )
    } finally {
      setProcessingOrderId(null)
    }
  }

  const isLoading = view === "active" ? isLoadingActive : isLoadingHistory
  const ordersToRender = view === "active" ? activeOrders : historyOrders
  const replacementOrderByOriginalId = useMemo(() => {
    const replacements = new Map<string, string>()

    for (const order of historyOrders) {
      const originalOrderId = order.pedido_corregido_de_id?.trim()

      if (originalOrderId) {
        replacements.set(originalOrderId, order.id)
      }
    }

    return replacements
  }, [historyOrders])

  const historySummary = useMemo(() => {
    if (view !== "history") {
      return null
    }

    const pedidos = historyOrders.length
    const totalHistorico = historyOrders.reduce((sum, order) => sum + order.total, 0)
    const cobrado = historyOrders.reduce(
      (sum, order) => sum + (isEffectivelyPaidOrder(order) ? order.total : 0),
      0,
    )
    const pendiente = Math.max(totalHistorico - cobrado, 0)
    const cancelados = historyOrders.reduce(
      (sum, order) => sum + (order.estado === "cancelado" ? 1 : 0),
      0,
    )
    const piezasVendidas = historyOrders.reduce((sum, order) => sum + getOrderSoldPieces(order), 0)

    return {
      pedidos,
      piezasVendidas,
      totalHistorico,
      cobrado,
      pendiente,
      cancelados,
    }
  }, [historyOrders, view])

  const todayDashboard = useMemo(() => {
    const totalVentas = todayDashboardOrders.reduce(
      (sum, order) => sum + (order.estado === "cancelado" ? 0 : order.total),
      0,
    )
    const pedidosHoy = todayDashboardOrders.length
    const piezasVendidas = todayDashboardOrders.reduce(
      (sum, order) => sum + getOrderSoldPieces(order),
      0,
    )
    const pendientesCobro = todayDashboardOrders.filter(
      (order) => order.estado !== "cancelado" && !isEffectivelyPaidOrder(order),
    ).length
    const canceladosHoy = todayDashboardOrders.filter(
      (order) => order.estado === "cancelado",
    ).length
    const enCaminoHoy = todayDashboardOrders.filter(
      (order) => order.estado === "en_camino",
    ).length

    return {
      totalVentas,
      pedidosHoy,
      piezasVendidas,
      pendientesCobro,
      canceladosHoy,
      enCaminoHoy,
    }
  }, [todayDashboardOrders])

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
              void Promise.all([
                view === "active" ? loadActiveOrders() : loadHistoryOrders(),
                loadTodayDashboardOrders(),
              ])
            }
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100"
          >
            Recargar pedidos
          </button>
        </div>
      </div>

      {view === "active" ? (
        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-6">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Ventas hoy
            </p>
            <p className="mt-1 text-base font-black text-slate-900">
              {currencyFormatter.format(todayDashboard.totalVentas)}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Pedidos hoy
            </p>
            <p className="mt-1 text-base font-black text-slate-900">{todayDashboard.pedidosHoy}</p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Piezas vendidas
            </p>
            <p className="mt-1 text-base font-black text-slate-900">
              {todayDashboard.piezasVendidas}
            </p>
          </article>

          <article className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              Pendientes cobro
            </p>
            <p className="mt-1 text-base font-black text-amber-800">
              {todayDashboard.pendientesCobro}
            </p>
          </article>

          <article className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600">
              Cancelados hoy
            </p>
            <p className="mt-1 text-base font-black text-rose-700">
              {todayDashboard.canceladosHoy}
            </p>
          </article>

          <article className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-600">
              En camino
            </p>
            <p className="mt-1 text-base font-black text-sky-700">{todayDashboard.enCaminoHoy}</p>
          </article>
        </div>
      ) : null}

      <div className="mt-6">
        {view === "history" ? (
          <div className="mb-4 flex justify-start">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
              <span className="uppercase tracking-[0.14em] text-slate-500">Fecha</span>
              <input
                type="date"
                value={historyDate}
                onChange={(event) => setHistoryDate(event.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>
        ) : null}

        {view === "history" && historySummary ? (
          <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-6">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Pedidos
              </p>
              <p className="mt-1 text-base font-black text-slate-900">
                {historySummary.pedidos}
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Piezas vendidas
              </p>
              <p className="mt-1 text-base font-black text-slate-900">
                {historySummary.piezasVendidas}
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Total historico
              </p>
              <p className="mt-1 text-base font-black text-slate-900">
                {currencyFormatter.format(historySummary.totalHistorico)}
              </p>
            </article>

            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
                Cobrado
              </p>
              <p className="mt-1 text-base font-black text-emerald-700">
                {currencyFormatter.format(historySummary.cobrado)}
              </p>
            </article>

            <article className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                Pendiente
              </p>
              <p className="mt-1 text-base font-black text-amber-800">
                {currencyFormatter.format(historySummary.pendiente)}
              </p>
            </article>

            <article className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600">
                Cancelados
              </p>
              <p className="mt-1 text-base font-black text-rose-700">
                {historySummary.cancelados}
              </p>
            </article>
          </div>
        ) : null}

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
              const cancelReason = order.motivo_cancelacion?.trim() || null
              const paymentMethodMeta = getPaymentMethodMeta(order.metodo_pago)
              const isHistoryView = view === "history"
              const replacedByOrderId = isHistoryView
                ? replacementOrderByOriginalId.get(order.id) ?? null
                : null
              const replacesOrderId = order.pedido_corregido_de_id?.trim() || null
              const hasCorrectionLinkage = Boolean(replacesOrderId || replacedByOrderId)

              return (
                <article
                  key={order.id}
                  className={`border border-slate-200 bg-slate-50/90 shadow-sm ${
                    isHistoryView
                      ? "rounded-[1.15rem] p-2.5 sm:rounded-[1.25rem] sm:p-3"
                      : "rounded-[1.35rem] p-3 sm:p-4"
                  }`}
                >
                  <div
                    className={`flex items-center justify-between ${
                      isHistoryView ? "gap-1.5" : "gap-2"
                    }`}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      {getShortOrderId(order.id)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ring-1 ${paymentStatusClasses}`}
                      >
                        {formatPaymentStatus(order.estado_pago)}
                      </span>

                      {isHistoryView ? (
                        <span
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700"
                          title={`Metodo de pago: ${paymentMethodMeta.label}`}
                          aria-label={`Metodo de pago: ${paymentMethodMeta.label}`}
                        >
                          {paymentMethodMeta.icon === "efectivo" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <rect x="3" y="6" width="18" height="12" rx="2" />
                              <circle cx="12" cy="12" r="2.5" />
                              <path d="M6 10h.01M18 14h.01" />
                            </svg>
                          ) : null}

                          {paymentMethodMeta.icon === "transferencia" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M4 7h13" />
                              <path d="m13 3 4 4-4 4" />
                              <path d="M20 17H7" />
                              <path d="m11 13-4 4 4 4" />
                            </svg>
                          ) : null}

                          {paymentMethodMeta.icon === "sin_definir" ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <circle cx="12" cy="12" r="9" />
                              <path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.8.7-1.7 1.2-1.7 2.2" />
                              <path d="M12 16.5h.01" />
                            </svg>
                          ) : null}
                        </span>
                      ) : null}

                      {adminAccess.isAuthenticated ? (
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
                                  void handleReprintTicket(order)
                                }}
                                disabled={isProcessing}
                                className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:text-slate-400"
                              >
                                Reimprimir ticket
                              </button>

                              {order.tipo_pedido === "domicilio" ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionsMenuOrderId(null)
                                    void handleRenotifyDispatch(order)
                                  }}
                                  disabled={isProcessing}
                                  className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                  Volver a notificar
                                </button>
                              ) : null}

                              {view === "active" && canCancelOrder(order) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionsMenuOrderId(null)
                                    void handleCancelOrder(order)
                                  }}
                                  disabled={isProcessing}
                                  className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-amber-700 transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                  Cancelar pedido
                                </button>
                              ) : null}

                              {view === "active" && canCancelOrder(order) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionsMenuOrderId(null)
                                    void handleCorrectOrder(order)
                                  }}
                                  disabled={isProcessing}
                                  className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                  Corregir pedido
                                </button>
                              ) : null}

                              {adminAccess.isAdmin && view === "history" && canSupervisedCorrectHistoryOrder(order) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionsMenuOrderId(null)
                                    void handleSupervisedHistoryCorrection(order)
                                  }}
                                  disabled={isProcessing}
                                  className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                  Corregir supervisada
                                </button>
                              ) : null}

                              {adminAccess.isAdmin ? (
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
                                {view === "history" ? "Eliminar registro" : "Eliminar pedido"}
                              </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <h3
                    className={`font-bold text-slate-900 ${
                      isHistoryView ? "mt-1 text-[14px]" : "mt-1.5 text-[15px]"
                    }`}
                  >
                    {customerName}
                  </h3>

                  {isHistoryView && hasCorrectionLinkage ? (
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">
                        Corregido
                      </span>
                      <p className="min-w-0 truncate text-[10px] font-semibold text-slate-600">
                        {replacesOrderId ? `Reemplaza ${getShortOrderId(replacesOrderId)}` : ""}
                        {replacesOrderId && replacedByOrderId ? " - " : ""}
                        {replacedByOrderId
                          ? `Reemplazado por ${getShortOrderId(replacedByOrderId)}`
                          : ""}
                      </p>
                    </div>
                  ) : null}

                  <dl
                    className={`grid grid-cols-2 text-xs ${
                      isHistoryView ? "mt-2 gap-x-2.5 gap-y-1" : "mt-2.5 gap-x-3 gap-y-1.5"
                    }`}
                  >
                    <div className="col-span-2 min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Fecha
                      </dt>
                      <dd
                        className={`truncate font-semibold text-slate-900 ${
                          isHistoryView ? "mt-0 text-[12px] leading-4" : "mt-0.5 text-[13px]"
                        }`}
                      >
                        {formatOrderDateTime(order.fecha_creacion)}
                      </dd>
                    </div>

                    <div className="col-span-2 min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Paquete
                      </dt>
                      <dd
                        className={`overflow-hidden font-semibold text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] ${
                          isHistoryView ? "mt-0 text-[11px] leading-4" : "mt-0.5 text-[12px] leading-4"
                        }`}
                      >
                        {packageSummary}
                      </dd>
                    </div>

                    {isHistoryView ? null : (
                      <div className="min-w-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Tipo
                        </dt>
                        <dd className="mt-0.5 truncate font-semibold text-slate-900">
                          {formatOrderType(order.tipo_pedido)}
                        </dd>
                      </div>
                    )}

                    <div className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Total
                      </dt>
                      <dd
                        className={`truncate font-black text-slate-900 ${
                          isHistoryView ? "mt-0 text-[13px]" : "mt-0.5 text-[14px]"
                        }`}
                      >
                        {currencyFormatter.format(order.total)}
                      </dd>
                    </div>

                    {isHistoryView ? null : (
                      <div className="min-w-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Metodo
                        </dt>
                        <dd className="mt-0.5 truncate font-semibold text-slate-900">
                          {formatPaymentMethod(order.metodo_pago)}
                        </dd>
                      </div>
                    )}

                    {view === "history" && order.estado === "cancelado" ? (
                      <div className="col-span-2 min-w-0">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Cancelacion
                        </dt>
                        <dd className="mt-0 space-y-0.5 text-[11px] leading-4 text-slate-700">
                          <p className="font-semibold text-amber-700">
                            {cancelReason ?? "Sin motivo registrado"}
                          </p>
                          <p>
                            {order.cancelado_en
                              ? `Cancelado el ${formatOrderDateTime(order.cancelado_en)}`
                              : "Fecha de cancelacion no disponible"}
                          </p>
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {order.tipo_pedido === "domicilio" ? (
                    <div className={isHistoryView ? "mt-2" : "mt-2.5"}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Direccion
                      </p>
                      <p
                        className={`overflow-hidden text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] ${
                          isHistoryView ? "mt-0 text-[11px] leading-4" : "mt-0.5 text-[12px] leading-4"
                        }`}
                      >
                        {deliveryNotes}
                      </p>
                    </div>
                  ) : null}

                  <div className={`flex flex-wrap gap-2 ${isHistoryView ? "mt-2.5" : "mt-3"}`}>
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

                        {statusAction ? (
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
                        ) : null}
                      </>
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
