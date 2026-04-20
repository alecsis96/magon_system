import type { EstadoPago, MetodoPago, PedidoDetalle, PedidoTipo, UUID } from "../types/database"

export const ORDER_CORRECTION_DRAFT_STORAGE_KEY = "pedido-correccion-draft-v1"

export type OrderCorrectionDraftDetail = {
  producto_id: UUID | null
  producto_codigo: string
  producto_nombre: string
  descripcion: string | null
  cantidad: number
  precio_unitario: number
  subtotal: number
  variante_3_4: string | null
  merma_descripcion: string | null
  alas: number
  piernas: number
  muslos: number
  pechugas_grandes: number
  pechugas_chicas: number
  merma_alas: number
  merma_piernas: number
  merma_muslos: number
  merma_pechugas_grandes: number
  merma_pechugas_chicas: number
}

export type OrderCorrectionDraft = {
  original_pedido_id: UUID
  short_order_id: string
  created_at: string
  original_fecha_creacion: string | null
  tipo_pedido: PedidoTipo
  metodo_pago: MetodoPago | null
  estado_pago: EstadoPago
  customer: {
    id: UUID | null
    nombre: string | null
    telefono: string | null
    direccion_habitual: string | null
    referencias: string | null
    notas_entrega: string | null
  } | null
  notas: string | null
  details: OrderCorrectionDraftDetail[]
}

function normalizeDraftDetail(value: unknown): OrderCorrectionDraftDetail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const detail = value as Record<string, unknown>
  const toNumber = (input: unknown, fallback = 0) => {
    if (typeof input !== "number" || !Number.isFinite(input)) {
      return fallback
    }
    return input
  }

  return {
    producto_id: typeof detail.producto_id === "string" ? detail.producto_id : null,
    producto_codigo:
      typeof detail.producto_codigo === "string" && detail.producto_codigo.trim()
        ? detail.producto_codigo
        : "sin_codigo",
    producto_nombre:
      typeof detail.producto_nombre === "string" && detail.producto_nombre.trim()
        ? detail.producto_nombre
        : "Producto",
    descripcion: typeof detail.descripcion === "string" ? detail.descripcion : null,
    cantidad: Math.max(1, Math.trunc(toNumber(detail.cantidad, 1))),
    precio_unitario: toNumber(detail.precio_unitario, 0),
    subtotal: toNumber(detail.subtotal, 0),
    variante_3_4: typeof detail.variante_3_4 === "string" ? detail.variante_3_4 : null,
    merma_descripcion:
      typeof detail.merma_descripcion === "string" ? detail.merma_descripcion : null,
    alas: Math.max(0, Math.trunc(toNumber(detail.alas, 0))),
    piernas: Math.max(0, Math.trunc(toNumber(detail.piernas, 0))),
    muslos: Math.max(0, Math.trunc(toNumber(detail.muslos, 0))),
    pechugas_grandes: Math.max(0, Math.trunc(toNumber(detail.pechugas_grandes, 0))),
    pechugas_chicas: Math.max(0, Math.trunc(toNumber(detail.pechugas_chicas, 0))),
    merma_alas: Math.max(0, Math.trunc(toNumber(detail.merma_alas, 0))),
    merma_piernas: Math.max(0, Math.trunc(toNumber(detail.merma_piernas, 0))),
    merma_muslos: Math.max(0, Math.trunc(toNumber(detail.merma_muslos, 0))),
    merma_pechugas_grandes: Math.max(
      0,
      Math.trunc(toNumber(detail.merma_pechugas_grandes, 0)),
    ),
    merma_pechugas_chicas: Math.max(0, Math.trunc(toNumber(detail.merma_pechugas_chicas, 0))),
  }
}

export function getOrderCorrectionDraftFromStorage(): OrderCorrectionDraft | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const rawValue =
      window.localStorage.getItem(ORDER_CORRECTION_DRAFT_STORAGE_KEY) ??
      window.sessionStorage.getItem(ORDER_CORRECTION_DRAFT_STORAGE_KEY)

    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>

    if (typeof parsedValue.original_pedido_id !== "string") {
      return null
    }

    const details = Array.isArray(parsedValue.details)
      ? parsedValue.details
          .map((detail) => normalizeDraftDetail(detail))
          .filter((detail): detail is OrderCorrectionDraftDetail => detail !== null)
      : []

    if (details.length === 0) {
      return null
    }

    const customerRaw = parsedValue.customer
    const customerRecord =
      customerRaw && typeof customerRaw === "object" && !Array.isArray(customerRaw)
        ? (customerRaw as Record<string, unknown>)
        : null
    const customer =
      customerRecord
        ? {
            id: typeof customerRecord.id === "string" ? customerRecord.id : null,
            nombre:
              typeof customerRecord.nombre === "string" ? customerRecord.nombre : null,
            telefono:
              typeof customerRecord.telefono === "string" ? customerRecord.telefono : null,
            direccion_habitual:
              typeof customerRecord.direccion_habitual === "string"
                ? customerRecord.direccion_habitual
                : null,
            referencias:
              typeof customerRecord.referencias === "string" ? customerRecord.referencias : null,
            notas_entrega:
              typeof customerRecord.notas_entrega === "string"
                ? customerRecord.notas_entrega
                : null,
          }
        : null

    return {
      original_pedido_id: parsedValue.original_pedido_id,
      short_order_id:
        typeof parsedValue.short_order_id === "string" && parsedValue.short_order_id.trim()
          ? parsedValue.short_order_id
          : `#${parsedValue.original_pedido_id.slice(0, 8).toUpperCase()}`,
      created_at:
        typeof parsedValue.created_at === "string"
          ? parsedValue.created_at
          : new Date().toISOString(),
      original_fecha_creacion:
        typeof parsedValue.original_fecha_creacion === "string"
          ? parsedValue.original_fecha_creacion
          : null,
      tipo_pedido:
        parsedValue.tipo_pedido === "domicilio" ? "domicilio" : "mostrador",
      metodo_pago:
        parsedValue.metodo_pago === "transferencia"
          ? "transferencia"
          : parsedValue.metodo_pago === "efectivo"
            ? "efectivo"
            : null,
      estado_pago: parsedValue.estado_pago === "pendiente" ? "pendiente" : "pagado",
      customer,
      notas: typeof parsedValue.notas === "string" ? parsedValue.notas : null,
      details,
    }
  } catch {
    return null
  }
}

export function saveOrderCorrectionDraftToStorage(draft: OrderCorrectionDraft) {
  if (typeof window === "undefined") {
    return
  }

  const serialized = JSON.stringify(draft)
  window.localStorage.setItem(ORDER_CORRECTION_DRAFT_STORAGE_KEY, serialized)
  window.sessionStorage.setItem(ORDER_CORRECTION_DRAFT_STORAGE_KEY, serialized)
}

export function clearOrderCorrectionDraftFromStorage() {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(ORDER_CORRECTION_DRAFT_STORAGE_KEY)
  window.sessionStorage.removeItem(ORDER_CORRECTION_DRAFT_STORAGE_KEY)
}

export function mapPedidoDetalleToCorrectionDraftDetail(
  detail: Pick<
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
  >,
): OrderCorrectionDraftDetail {
  return {
    producto_id: detail.producto_id,
    producto_codigo: detail.producto_codigo,
    producto_nombre: detail.producto_nombre,
    descripcion: detail.descripcion,
    cantidad: detail.cantidad,
    precio_unitario: detail.precio_unitario,
    subtotal: detail.subtotal,
    variante_3_4: detail.variante_3_4,
    merma_descripcion: detail.merma_descripcion,
    alas: detail.alas,
    piernas: detail.piernas,
    muslos: detail.muslos,
    pechugas_grandes: detail.pechugas_grandes,
    pechugas_chicas: detail.pechugas_chicas,
    merma_alas: detail.merma_alas,
    merma_piernas: detail.merma_piernas,
    merma_muslos: detail.merma_muslos,
    merma_pechugas_grandes: detail.merma_pechugas_grandes,
    merma_pechugas_chicas: detail.merma_pechugas_chicas,
  }
}
