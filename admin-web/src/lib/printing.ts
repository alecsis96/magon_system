export type PrintableOrderItem = {
  detalle_id: string
  pedido_id: string
  producto_id: string | null
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

export type PrintableOrder = {
  pedido_id: string
  folio: string | null
  fecha_creacion: string | null
  estado: string | null
  tipo_pedido: string
  metodo_pago: string | null
  estado_pago: string
  total: number
  cliente_id: string | null
  cliente_nombre: string | null
  cliente_telefono: string | null
  cliente_impresion: string | null
  items: PrintableOrderItem[]
}

declare global {
  interface Window {
    AndroidPrinter?: {
      imprimirTicket: (texto: string) => void
    }
  }
}

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

function parseSupabaseTimestamp(value: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return null
  }

  const hasExplicitTimeZone =
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalizedValue)

  const parsedDate = new Date(
    hasExplicitTimeZone ? normalizedValue : `${normalizedValue}Z`,
  )

  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return parsedDate
}

function formatTicketDate(value: string | null) {
  if (!value) {
    return "SIN FECHA"
  }

  const parsedDate = parseSupabaseTimestamp(value)

  if (!parsedDate) {
    return value
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(parsedDate)
}

function normalizeOrderType(value: string | null | undefined) {
  if (!value) {
    return "MOSTRADOR"
  }

  return value.replace(/_/g, " ").toUpperCase()
}

function normalizePaymentLabel(value: string | null | undefined) {
  if (!value) {
    return "SIN METODO"
  }

  return value.replace(/_/g, " ").toUpperCase()
}

function normalizeThreeQuarterVariant(value: string | null | undefined) {
  if (!value) {
    return null
  }

  if (value === "ala_pechuga") {
    return "1/2 + ALA + PECHUGA"
  }

  if (value === "pierna_muslo") {
    return "1/2 + PIERNA + MUSLO"
  }

  return value.replace(/_/g, " ").toUpperCase()
}

function buildPieceSummary(item: PrintableOrderItem) {
  const parts: string[] = []

  if (item.alas > 0) {
    parts.push(`${item.alas} ALA${item.alas === 1 ? "" : "S"}`)
  }
  if (item.piernas > 0) {
    parts.push(`${item.piernas} PIERNA${item.piernas === 1 ? "" : "S"}`)
  }
  if (item.muslos > 0) {
    parts.push(`${item.muslos} MUSLO${item.muslos === 1 ? "" : "S"}`)
  }
  if (item.pechugas_grandes > 0) {
    parts.push(
      `${item.pechugas_grandes} PECHUGA${item.pechugas_grandes === 1 ? " GDE" : "S GDES"}`,
    )
  }
  if (item.pechugas_chicas > 0) {
    parts.push(
      `${item.pechugas_chicas} PECHUGA${item.pechugas_chicas === 1 ? " CH" : "S CH"}`,
    )
  }

  return parts.join(", ")
}

function buildKitchenNotes(item: PrintableOrderItem) {
  const notes: string[] = []
  const description = item.descripcion?.trim()
  const variant = normalizeThreeQuarterVariant(item.variante_3_4)
  const pieces = buildPieceSummary(item)
  const merma = item.merma_descripcion?.trim()

  if (description) {
    notes.push(`NOTA: ${description.toUpperCase()}`)
  }

  if (variant) {
    notes.push(`VARIANTE: ${variant}`)
  }

  if (pieces) {
    notes.push(`PIEZAS: ${pieces}`)
  }

  if (merma) {
    notes.push(`MODIFICADOR: ${merma.toUpperCase()}`)
  }

  return notes
}

function buildClientNotes(item: PrintableOrderItem) {
  const notes: string[] = []
  const description = item.descripcion?.trim()
  const variant = normalizeThreeQuarterVariant(item.variante_3_4)
  const merma = item.merma_descripcion?.trim()

  if (description) {
    notes.push(`  Nota: ${description}`)
  }

  if (variant) {
    notes.push(`  Variante: ${variant}`)
  }

  if (merma) {
    notes.push(`  Modificador: ${merma}`)
  }

  return notes
}

export function generarTextoTicket(
  order: PrintableOrder,
  esCocina: boolean,
) {
  const separator = "--------------------------------"
  const header = esCocina ? "TICKET COCINA" : "POLLO MAGON"
  const folio = order.folio ?? order.pedido_id
  const date = formatTicketDate(order.fecha_creacion)
  const orderType = normalizeOrderType(order.tipo_pedido)

  if (esCocina) {
    const itemLines = order.items.flatMap((item) => {
      const lines = [`${item.cantidad}x ${item.producto_nombre.toUpperCase()}`]
      const notes = buildKitchenNotes(item)

      for (const note of notes) {
        lines.push(`  ${note}`)
      }

      return [...lines, separator]
    })

    return [
      "==============================",
      header,
      "==============================",
      `FOLIO: ${folio}`,
      `ENVIO: ${orderType}`,
      `FECHA: ${date}`,
      separator,
      ...itemLines,
      "",
    ].join("\n")
  }

  const clientName = order.cliente_impresion?.trim() || "PUBLICO GENERAL"
  const itemLines = order.items.flatMap((item) => {
    const lines = [
      `${item.cantidad} x ${item.producto_nombre}`,
      `  ${currencyFormatter.format(item.precio_unitario)}  SUBTOTAL: ${currencyFormatter.format(item.subtotal)}`,
    ]

    return [...lines, ...buildClientNotes(item)]
  })

  return [
    "POLLO MAGON",
    separator,
    `FOLIO: ${folio}`,
    `FECHA: ${date}`,
    `TIPO: ${orderType}`,
    `CLIENTE: ${clientName}`,
    `PAGO: ${normalizePaymentLabel(order.metodo_pago)}`,
    separator,
    ...itemLines,
    separator,
    `TOTAL: ${currencyFormatter.format(order.total)}`,
    "GRACIAS POR SU COMPRA",
    "",
  ].join("\n")
}

export function ejecutarImpresionBluetooth(texto: string) {
  if (window.AndroidPrinter?.imprimirTicket) {
    window.AndroidPrinter.imprimirTicket(texto)
    return
  }

  console.warn("AndroidPrinter no disponible. Simulando impresion:\n" + texto)
}
