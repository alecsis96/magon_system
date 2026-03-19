export const PIEZAS_POR_POLLO = {
  alas: 2,
  piernas: 2,
  muslos: 2,
  pechugas_grandes: 2,
  pechugas_chicas: 2,
} as const

export type InventoryPieceKey = keyof typeof PIEZAS_POR_POLLO

export type PieceBreakdown = Record<InventoryPieceKey, number>
export type ThreeQuarterVariant = "ala_pechuga" | "pierna_muslo"
export type InventoryProductKey =
  | "1_pollo"
  | "3/4_pollo"
  | "1/2_pollo"
  | "combo_papas"

export const EMPTY_PIECE_BREAKDOWN: PieceBreakdown = {
  alas: 0,
  piernas: 0,
  muslos: 0,
  pechugas_grandes: 0,
  pechugas_chicas: 0,
}

export const PRODUCTO_DESGLOSE: Record<InventoryProductKey, PieceBreakdown> = {
  "1_pollo": { ...PIEZAS_POR_POLLO },
  "1/2_pollo": {
    alas: 1,
    piernas: 1,
    muslos: 1,
    pechugas_grandes: 1,
    pechugas_chicas: 1,
  },
  combo_papas: { ...PIEZAS_POR_POLLO },
  "3/4_pollo": {
    alas: 0,
    piernas: 0,
    muslos: 0,
    pechugas_grandes: 0,
    pechugas_chicas: 0,
  },
}

export const THREE_QUARTER_VARIANTS: Record<ThreeQuarterVariant, PieceBreakdown> =
  {
    ala_pechuga: {
      alas: 2,
      piernas: 1,
      muslos: 1,
      pechugas_grandes: 2,
      pechugas_chicas: 1,
    },
    pierna_muslo: {
      alas: 1,
      piernas: 2,
      muslos: 2,
      pechugas_grandes: 1,
      pechugas_chicas: 1,
    },
  }

export const THREE_QUARTER_VARIANT_LABELS: Record<ThreeQuarterVariant, string> = {
  ala_pechuga: "1/2 pollo + ala + pechuga grande",
  pierna_muslo: "1/2 pollo + pierna + muslo",
}

export const PIECE_LABELS: Record<InventoryPieceKey, string> = {
  alas: "Alas",
  piernas: "Piernas",
  muslos: "Muslos",
  pechugas_grandes: "Pechugas Grandes",
  pechugas_chicas: "Pechugas Chicas",
}

export const MERMA_LABELS = {
  caidos: "Caidos / golpeados",
  quemados: "Quemados",
} as const

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

export function resolveInventoryProductKey(product: {
  id: string
  nombre: string
  descripcion?: string | null
  clave_inventario?: string | null
}): InventoryProductKey | null {
  const explicitInventoryKey = product.clave_inventario

  if (
    explicitInventoryKey === "1_pollo" ||
    explicitInventoryKey === "3/4_pollo" ||
    explicitInventoryKey === "1/2_pollo" ||
    explicitInventoryKey === "combo_papas"
  ) {
    return explicitInventoryKey
  }

  const rawId = product.id
  const normalizedId = normalizeText(rawId).replace(/\s+/g, "_")
  const normalizedName = normalizeText(product.nombre)
  const normalizedDescription = normalizeText(product.descripcion)
  const combinedText = `${normalizedName} ${normalizedDescription}`.trim()

  if (
    normalizedId === "1_pollo" ||
    normalizedId === "producto-1" ||
    combinedText.includes("1 pollo")
  ) {
    return "1_pollo"
  }

  if (
    normalizedId === "3/4_pollo" ||
    normalizedId === "producto-2" ||
    combinedText.includes("3/4 pollo")
  ) {
    return "3/4_pollo"
  }

  if (
    normalizedId === "1/2_pollo" ||
    normalizedId === "producto-3" ||
    combinedText.includes("1/2 pollo") ||
    combinedText.includes("medio pollo")
  ) {
    return "1/2_pollo"
  }

  if (
    normalizedId === "combo_papas" ||
    normalizedId === "producto-4" ||
    combinedText.includes("combo papas")
  ) {
    return "combo_papas"
  }

  return null
}

export function getProductBreakdown(product: {
  id: string
  nombre: string
  descripcion?: string | null
  clave_inventario?: string | null
}): PieceBreakdown {
  const productKey = resolveInventoryProductKey(product)

  if (!productKey || productKey === "3/4_pollo") {
    return EMPTY_PIECE_BREAKDOWN
  }

  return PRODUCTO_DESGLOSE[productKey]
}

export function getTotalPieces(breakdown: PieceBreakdown) {
  return Object.values(breakdown).reduce((total, value) => total + value, 0)
}
