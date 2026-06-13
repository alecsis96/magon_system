import { useCallback, useEffect, useRef, useState } from "react"
import { Toaster, toast } from "react-hot-toast"
import { AccountingDashboard } from "./components/AccountingDashboard"
import { AdminClientes } from "./components/AdminClientes"
import { AuditLog } from "./components/AuditLog"
import { OptionalCheckoutCustomerPicker } from "./components/OptionalCheckoutCustomerPicker"
import { CustomerSelector } from "./components/CustomerSelector"
import { InventoryManager } from "./components/InventoryManager"
import { OrdersMonitor } from "./components/OrdersMonitor"
import { POSMenu } from "./components/POSMenu"
import { ProductCatalogManager } from "./components/ProductCatalogManager"
import {
  PIECE_LABELS,
  THREE_QUARTER_VARIANTS,
  THREE_QUARTER_VARIANT_LABELS,
  getInventoryPieceCount,
  getProductBreakdown,
  resolveInventoryProductKey,
  type InventoryPieceKey,
  type PieceBreakdown,
  type ThreeQuarterVariant,
} from "./constants/inventory"
import {
  ejecutarImpresionBluetooth,
  generarTextoTicket,
  type PrintableOrder,
} from "./lib/printing"
import { getAdminAccess, type AdminAccess } from "./lib/admin"
import { getTodayDateKey, toDateKey } from "./lib/datetime"
import {
  clearOrderCorrectionDraftFromStorage,
  getOrderCorrectionDraftFromStorage,
  type OrderCorrectionDraft,
  type OrderCorrectionDraftDetail,
} from "./lib/orderCorrectionDraft"
import { sendDispatchPushNotification } from "./lib/push"
import { supabase } from "./lib/supabase"
import type {
  Cliente,
  InventarioDiario,
  PedidoInsert,
  Producto,
  RegistrarVentaPosResult,
} from "./types/database"

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

const DEFAULT_ADMIN_ACCESS: AdminAccess = {
  isAuthenticated: false,
  isAdmin: false,
  email: null,
}

type ProductoDetalle = {
  piezasInventario: number
  desglose: string | null
  mermaOptions: string[]
}

type InventoryDiscountMode = "fijo" | "manual" | "fijo_por_pieza"

type InventoryDiscountConfig = {
  mode: InventoryDiscountMode
  piezasASeleccionar: number | null
  piezasPermitidas: InventoryPieceKey[]
  permiteRepetirPiezas: boolean
  desgloseFijo: PieceBreakdown | null
}

type CartItem = {
  lineId: string
  producto: Producto
  merma: string | null
  threeQuarterVariant: ThreeQuarterVariant | null
  manualPieceSelection: InventoryPieceKey[]
  correctionDetail?: OrderCorrectionDraftDetail
}

type PrimaryTab = "POS" | "MONITOR"
type SecondaryTab =
  | "INVENTARIO"
  | "PRODUCTOS"
  | "CONTABILIDAD"
  | "CLIENTES"
  | "AUDITORIA"
type AppTab = PrimaryTab | SecondaryTab

const SECONDARY_TAB_CHIPS: Array<{ id: SecondaryTab; label: string }> = [
  { id: "INVENTARIO", label: "Inventario" },
  { id: "PRODUCTOS", label: "Productos" },
  { id: "CONTABILIDAD", label: "Contabilidad" },
  { id: "CLIENTES", label: "Clientes" },
  { id: "AUDITORIA", label: "Auditoria" },
]

const MERMA_OPTIONS = [
  "Ala quemada",
  "Pierna quemada",
  "Muslo quemado",
  "Pechuga grande quemada",
  "Pechuga chica quemada",
]

const MERMA_TO_PIECE_MAP: Record<string, InventoryPieceKey> = {
  "Ala quemada": "alas",
  "Pierna quemada": "piernas",
  "Muslo quemado": "muslos",
  "Pechuga grande quemada": "pechugas_grandes",
  "Pechuga chica quemada": "pechugas_chicas",
}

const ALL_PIECE_KEYS = Object.keys(PIECE_LABELS) as InventoryPieceKey[]
const DEFAULT_PIECE_MINIMUM_THRESHOLD = 5

const PIECE_STOCK_FIELD_MAP: Record<
  InventoryPieceKey,
  keyof Pick<
    InventarioDiario,
    | "stock_alas"
    | "stock_piernas"
    | "stock_muslos"
    | "stock_pechugas_g"
    | "stock_pechugas_c"
  >
> = {
  alas: "stock_alas",
  piernas: "stock_piernas",
  muslos: "stock_muslos",
  pechugas_grandes: "stock_pechugas_g",
  pechugas_chicas: "stock_pechugas_c",
}

const PIECE_MIN_FIELD_MAP: Record<
  InventoryPieceKey,
  keyof Pick<
    InventarioDiario,
    | "min_alas"
    | "min_piernas"
    | "min_muslos"
    | "min_pechugas_g"
    | "min_pechugas_c"
  >
> = {
  alas: "min_alas",
  piernas: "min_piernas",
  muslos: "min_muslos",
  pechugas_grandes: "min_pechugas_g",
  pechugas_chicas: "min_pechugas_c",
}

function isInventoryPieceKey(value: unknown): value is InventoryPieceKey {
  return (
    typeof value === "string" &&
    (ALL_PIECE_KEYS as string[]).includes(value)
  )
}

function parsePieceArray(value: unknown): InventoryPieceKey[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((piece) => isInventoryPieceKey(piece))
}

function parseBreakdown(value: unknown): PieceBreakdown | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const base = createEmptyPieceBreakdown()
  let hasValue = false

  for (const pieceKey of ALL_PIECE_KEYS) {
    const rawCount = (value as Record<string, unknown>)[pieceKey]

    if (rawCount === undefined || rawCount === null) {
      continue
    }

    if (typeof rawCount !== "number" || !Number.isFinite(rawCount)) {
      continue
    }

    const normalizedCount = Math.max(0, Math.trunc(rawCount))
    base[pieceKey] = normalizedCount

    if (normalizedCount > 0) {
      hasValue = true
    }
  }

  return hasValue ? base : null
}

function describeBreakdown(breakdown: PieceBreakdown) {
  return ALL_PIECE_KEYS
    .filter((pieceKey) => breakdown[pieceKey] > 0)
    .map((pieceKey) => `${breakdown[pieceKey]} ${PIECE_LABELS[pieceKey]}`)
    .join(", ")
}

function getInventoryDiscountConfig(producto: Producto): InventoryDiscountConfig {
  const inventoryPieceCount = getInventoryPieceCount(producto) ?? 0
  const modeRaw = producto.modo_descuento_inventario
  let mode: InventoryDiscountMode = "fijo"

  if (modeRaw === "manual") {
    mode = "manual"
  } else if (modeRaw === "fijo_por_pieza") {
    mode = "fijo_por_pieza"
  }
  const parsedAllowedPieces = parsePieceArray(producto.piezas_permitidas)
  const parsedBreakdown = parseBreakdown(producto.desglose_fijo)

  if (mode === "manual") {
    return {
      mode,
      piezasASeleccionar:
        producto.piezas_a_seleccionar ??
        (inventoryPieceCount > 0 ? inventoryPieceCount : 1),
      piezasPermitidas:
        parsedAllowedPieces.length > 0 ? parsedAllowedPieces : ALL_PIECE_KEYS,
      permiteRepetirPiezas: producto.permite_repetir_piezas ?? true,
      desgloseFijo: null,
    }
  }

  if (mode === "fijo_por_pieza") {
    const fallbackBreakdown = createEmptyPieceBreakdown()
    fallbackBreakdown.pechugas_chicas = 1

    return {
      mode,
      piezasASeleccionar: null,
      piezasPermitidas: ALL_PIECE_KEYS,
      permiteRepetirPiezas: true,
      desgloseFijo: parsedBreakdown ?? fallbackBreakdown,
    }
  }

  return {
    mode: "fijo",
    piezasASeleccionar: null,
    piezasPermitidas: ALL_PIECE_KEYS,
    permiteRepetirPiezas: true,
    desgloseFijo: parsedBreakdown,
  }
}

function getProductoDetalle(producto: Producto): ProductoDetalle {
  const inventoryPieces = getInventoryPieceCount(producto) ?? 0
  const productConfig = getInventoryDiscountConfig(producto)
  const productKey = resolveInventoryProductKey(producto)

  let desglose: string | null = null

  if (isThreeQuarterProduct(producto)) {
    desglose = "1/2 pollo + ala + pechuga grande o 1/2 pollo + pierna + muslo"
  } else if (productConfig.mode === "manual" && productConfig.piezasASeleccionar) {
    desglose = `Seleccion manual: ${productConfig.piezasASeleccionar} pieza${productConfig.piezasASeleccionar === 1 ? "" : "s"}`
  } else if (productConfig.mode === "fijo_por_pieza" && productConfig.desgloseFijo) {
    desglose = `Fijo por pieza: ${describeBreakdown(productConfig.desgloseFijo)}`
  } else if (productConfig.desgloseFijo) {
    desglose = describeBreakdown(productConfig.desgloseFijo)
  } else {
    const legacyBreakdown = getProductBreakdown(producto)
    const hasLegacyBreakdown = Object.values(legacyBreakdown).some(
      (value) => value > 0,
    )

    if (hasLegacyBreakdown) {
      desglose = describeBreakdown(legacyBreakdown)
    } else if (inventoryPieces > 0) {
      desglose = `${inventoryPieces} pieza${inventoryPieces === 1 ? "" : "s"} descontadas del inventario principal`
    } else if (productKey === "3/4_pollo") {
      desglose = "1/2 pollo + ala + pechuga grande o 1/2 pollo + pierna + muslo"
    }
  }

  return {
    piezasInventario: inventoryPieces,
    desglose,
    mermaOptions: MERMA_OPTIONS,
  }
}

function isThreeQuarterProduct(producto: Producto) {
  return (
    producto.requiere_variante_3_4 ||
    resolveInventoryProductKey(producto) === "3/4_pollo"
  )
}

function getManualPieceRequirement(producto: Producto) {
  const config = getInventoryDiscountConfig(producto)

  if (config.mode !== "manual") {
    return null
  }

  return config.piezasASeleccionar
}

function requiresManualPieceSelection(producto: Producto) {
  return getManualPieceRequirement(producto) !== null
}

function getManualSelectionLabel(selectedPieces: InventoryPieceKey[]) {
  const pieceCounts = selectedPieces.reduce(
    (currentCounts, pieceKey) => {
      currentCounts[pieceKey] += 1
      return currentCounts
    },
    createEmptyPieceBreakdown(),
  )

  const labels = (Object.keys(PIECE_LABELS) as InventoryPieceKey[])
    .filter((pieceKey) => pieceCounts[pieceKey] > 0)
    .map((pieceKey) => {
      const count = pieceCounts[pieceKey]
      const pieceLabel = PIECE_LABELS[pieceKey]
      return `${count} ${pieceLabel}${count === 1 ? "" : "s"}`
    })

  return labels.join(", ")
}

function canAddManualPiece(
  item: CartItem,
  pieceType: InventoryPieceKey,
  manualPieceRequirement: number,
) {
  if (item.manualPieceSelection.length >= manualPieceRequirement) {
    return false
  }

  const config = getInventoryDiscountConfig(item.producto)

  if (!config.permiteRepetirPiezas) {
    return !item.manualPieceSelection.includes(pieceType)
  }

  return true
}

function createEmptyPieceBreakdown(): PieceBreakdown {
  return {
    alas: 0,
    piernas: 0,
    muslos: 0,
    pechugas_grandes: 0,
    pechugas_chicas: 0,
  }
}

function getCartItemBreakdown(item: CartItem) {
  if (isThreeQuarterProduct(item.producto)) {
    if (!item.threeQuarterVariant) {
      return createEmptyPieceBreakdown()
    }

    return THREE_QUARTER_VARIANTS[item.threeQuarterVariant]
  }

  if (requiresManualPieceSelection(item.producto)) {
    if (item.manualPieceSelection.length === 0) {
      return createEmptyPieceBreakdown()
    }

    return item.manualPieceSelection.reduce((breakdown, pieceType) => {
      breakdown[pieceType] += 1
      return breakdown
    }, createEmptyPieceBreakdown())
  }

  const config = getInventoryDiscountConfig(item.producto)

  if (config.mode === "fijo_por_pieza" && config.desgloseFijo) {
    return config.desgloseFijo
  }

  if (config.mode === "fijo" && config.desgloseFijo) {
    return config.desgloseFijo
  }

  return getProductBreakdown(item.producto)
}

function getCartItemMermaBreakdown(item: CartItem) {
  const mermaBreakdown = createEmptyPieceBreakdown()

  if (!item.merma) {
    return mermaBreakdown
  }

  const mermaPiece = MERMA_TO_PIECE_MAP[item.merma]

  if (mermaPiece) {
    mermaBreakdown[mermaPiece] = 1
  }

  return mermaBreakdown
}

function getTodayLocalISODate() {
  return getTodayDateKey()
}

function getCheckoutInventoryDate(correctionDraft: OrderCorrectionDraft | null) {
  if (!correctionDraft?.original_fecha_creacion) {
    return getTodayLocalISODate()
  }

  const parsedOriginalDateKey = toDateKey(correctionDraft.original_fecha_creacion)
  return parsedOriginalDateKey || getTodayLocalISODate()
}

function formatNowForDateTimeLocalInput() {
  const now = new Date()
  now.setSeconds(0, 0)
  const localMillis = now.getTime() - now.getTimezoneOffset() * 60000
  return new Date(localMillis).toISOString().slice(0, 16)
}

function getPiecesFromCorrectionDetail(detail: OrderCorrectionDraftDetail) {
  const explicitPieces =
    detail.alas +
    detail.piernas +
    detail.muslos +
    detail.pechugas_grandes +
    detail.pechugas_chicas

  if (explicitPieces > 0) {
    return explicitPieces
  }

  return Math.max(1, detail.cantidad)
}

function createCartItemFromCorrectionDetail(
  detail: OrderCorrectionDraftDetail,
  index: number,
): CartItem {
  const productId = detail.producto_id ?? `draft-${index}-${Date.now()}`

  return {
    lineId: `correction-${index}-${Date.now()}`,
    correctionDetail: detail,
    producto: {
      id: productId,
      nombre: detail.producto_nombre,
      descripcion: detail.descripcion,
      precio: detail.subtotal,
      categoria: null,
      subcategoria: null,
      clave_inventario: detail.producto_codigo,
      piezas_inventario: getPiecesFromCorrectionDetail(detail),
      requiere_variante_3_4: false,
      modo_descuento_inventario: "fijo",
      piezas_a_seleccionar: null,
      piezas_permitidas: null,
      permite_repetir_piezas: true,
      desglose_fijo: null,
    },
    merma: detail.merma_descripcion,
    threeQuarterVariant: null,
    manualPieceSelection: [],
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function showSaleSuccessToast(
  totalVenta: number,
  piezas: number,
  dispatchStatus: "none" | "sent" | "failed" = "none",
) {
  const statusMessage =
    dispatchStatus === "sent"
      ? "Repartidor notificado"
      : dispatchStatus === "failed"
        ? "Venta guardada, pero no se notifico al repartidor"
        : "Venta registrada"

  toast.custom(
    () => (
      <div className="w-[min(90vw,18rem)] rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur">
        <p className="text-sm font-semibold text-slate-900">
          {statusMessage}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {currencyFormatter.format(totalVenta)} - {piezas} pzs
        </p>
      </div>
    ),
    { duration: 1800, position: "top-right" },
  )
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

function isMissingTodayInventoryError(message: string) {
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes("inventario de hoy no iniciado")) {
    return true
  }

  return (
    normalizedMessage.includes("inventario") &&
    (normalizedMessage.includes("no iniciado") ||
      normalizedMessage.includes("inicia") ||
      normalizedMessage.includes("iniciado"))
  )
}

function isMissingInventoryStockColumnsError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false
  }

  const code = "code" in error ? String(error.code ?? "") : ""
  const message = getErrorMessage(error).toLowerCase()

  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("stock_alas") ||
    message.includes("stock_piernas") ||
    message.includes("stock_muslos") ||
    message.includes("stock_pechugas_g") ||
    message.includes("stock_pechugas_c") ||
    message.includes("column") && message.includes("does not exist")
  )
}

function VentaIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 7.5h16" />
      <path d="M6 4.5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
      <path d="M9 12h6" />
      <path d="M9 15.5h3" />
    </svg>
  )
}

function PedidosIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  )
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("POS")
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)
  const [openMermaItemId, setOpenMermaItemId] = useState<string | null>(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [isDispatchPromptOpen, setIsDispatchPromptOpen] = useState(false)
  const [tipoPedido, setTipoPedido] = useState<"mostrador" | "domicilio">(
    "mostrador",
  )
  const [selectedCustomer, setSelectedCustomer] = useState<Cliente | null>(null)
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia">(
    "efectivo",
  )
  const [estadoPago, setEstadoPago] = useState<"pagado" | "pendiente">(
    "pagado",
  )
  const [todayIsoDate, setTodayIsoDate] = useState(getTodayLocalISODate())
  const [isInventoryReadyForToday, setIsInventoryReadyForToday] =
    useState<boolean>(true)
  const [totalAvailablePieces, setTotalAvailablePieces] = useState<number | null>(null)
  const [lowStockPieceNames, setLowStockPieceNames] = useState<string[]>([])
  const [isCheckingInventoryStatus, setIsCheckingInventoryStatus] =
    useState<boolean>(true)
  const [isPosAdminPanelOpen, setIsPosAdminPanelOpen] = useState(false)
  const [adminAccess, setAdminAccess] = useState<AdminAccess>(DEFAULT_ADMIN_ACCESS)
  const [isLoadingAdminAccess, setIsLoadingAdminAccess] = useState(true)
  const [adminEmail, setAdminEmail] = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const [isSubmittingAdminAccess, setIsSubmittingAdminAccess] = useState(false)
  const [orderCorrectionDraft, setOrderCorrectionDraft] =
    useState<OrderCorrectionDraft | null>(null)
  const [isRetroactiveModeEnabled, setIsRetroactiveModeEnabled] = useState(false)
  const [retroactiveDateTimeLocal, setRetroactiveDateTimeLocal] = useState(
    formatNowForDateTimeLocalInput,
  )
  const [retroactiveReason, setRetroactiveReason] = useState("")
  const posAdminPanelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const tabletMediaQuery = window.matchMedia(
      "(min-width: 768px) and (max-width: 1280px) and (pointer: coarse)",
    )

    const syncTabletDensity = () => {
      document.documentElement.classList.toggle(
        "tablet-ui",
        tabletMediaQuery.matches,
      )
    }

    syncTabletDensity()
    tabletMediaQuery.addEventListener("change", syncTabletDensity)

    return () => {
      document.documentElement.classList.remove("tablet-ui")
      tabletMediaQuery.removeEventListener("change", syncTabletDensity)
    }
  }, [])

  const refreshAdminAccess = useCallback(async () => {
    try {
      setIsLoadingAdminAccess(true)
      const nextAccess = await getAdminAccess()
      setAdminAccess(nextAccess)
    } catch (error) {
      console.error("Error al validar acceso admin:", error)
      setAdminAccess(DEFAULT_ADMIN_ACCESS)
    } finally {
      setIsLoadingAdminAccess(false)
    }
  }, [])

  const loadOrderCorrectionDraft = useCallback(() => {
    setOrderCorrectionDraft(getOrderCorrectionDraftFromStorage())
  }, [])

  const applyOrderCorrectionDraftToPos = useCallback(
    (draft: OrderCorrectionDraft) => {
      const nextCart = draft.details.map((detail, index) =>
        createCartItemFromCorrectionDetail(detail, index),
      )

      if (nextCart.length === 0) {
        return
      }

      setCart(nextCart)
      setTipoPedido(draft.tipo_pedido === "domicilio" ? "domicilio" : "mostrador")
      setMetodoPago(
        draft.metodo_pago === "transferencia" ? "transferencia" : "efectivo",
      )
      setEstadoPago(draft.estado_pago === "pendiente" ? "pendiente" : "pagado")

      if (draft.customer?.id && draft.customer?.nombre && draft.customer?.telefono) {
        setSelectedCustomer({
          id: draft.customer.id,
          nombre: draft.customer.nombre,
          telefono: draft.customer.telefono,
          url_foto_fachada: null,
          foto_valida: false,
          latitud: null,
          longitud: null,
          direccion_habitual: draft.customer.direccion_habitual,
          referencias: draft.customer.referencias,
          notas_entrega: draft.customer.notas_entrega,
        })
      } else {
        setSelectedCustomer(null)
      }

      setIsCheckoutModalOpen(false)
      setIsDispatchPromptOpen(false)
      setOpenMermaItemId(null)
      setIsRetroactiveModeEnabled(false)
      setRetroactiveDateTimeLocal(formatNowForDateTimeLocalInput())
      setRetroactiveReason("")
    },
    [],
  )

  const handleStartCorrectionFromMonitor = useCallback(() => {
    const draft = getOrderCorrectionDraftFromStorage()

    if (!draft) {
      toast.error("No se encontro borrador de correccion")
      setActiveTab("POS")
      setIsMoreMenuOpen(false)
      return
    }

    setOrderCorrectionDraft(draft)
    setActiveTab("POS")
    setIsMoreMenuOpen(false)
    applyOrderCorrectionDraftToPos(draft)
  }, [applyOrderCorrectionDraftToPos])

  const checkTodayInventoryStatus = useCallback(async (targetDate: string) => {
    try {
      setIsCheckingInventoryStatus(true)

      const inventorySelectFields =
        "id,stock_alas,stock_piernas,stock_muslos,stock_pechugas_g,stock_pechugas_c,min_alas,min_piernas,min_muslos,min_pechugas_g,min_pechugas_c"
      let response = await supabase
        .from("inventario_diario")
        .select(inventorySelectFields)
        .eq("fecha", targetDate)
        .maybeSingle()

      if (response.error && isMissingInventoryStockColumnsError(response.error)) {
        response = await supabase
          .from("inventario_diario")
          .select("id")
          .eq("fecha", targetDate)
          .maybeSingle()
      }

      if (response.error) {
        throw response.error
      }

      const data = response.data

      if (!data?.id) {
        setIsInventoryReadyForToday(false)
        setTotalAvailablePieces(null)
        setLowStockPieceNames([])
        return
      }

      if (!("stock_alas" in data)) {
        setIsInventoryReadyForToday(true)
        setTotalAvailablePieces(null)
        setLowStockPieceNames([])
        return
      }

      const inventory = data as InventarioDiario
      setIsInventoryReadyForToday(true)
      setTotalAvailablePieces(
        ALL_PIECE_KEYS.reduce((sum, pieceKey) => {
          const stockField = PIECE_STOCK_FIELD_MAP[pieceKey]
          const stockValue =
            typeof inventory[stockField] === "number" ? Math.round(inventory[stockField]) : 0

          return sum + Math.max(0, stockValue)
        }, 0),
      )

      const lowStock = ALL_PIECE_KEYS.filter((pieceKey) => {
        const stockField = PIECE_STOCK_FIELD_MAP[pieceKey]
        const minField = PIECE_MIN_FIELD_MAP[pieceKey]
        const stockValue =
          typeof inventory[stockField] === "number" ? Math.round(inventory[stockField]) : 0
        const minValue =
          typeof inventory[minField] === "number"
            ? Math.max(0, Math.round(inventory[minField]))
            : DEFAULT_PIECE_MINIMUM_THRESHOLD

        return stockValue < minValue
      }).map((pieceKey) => PIECE_LABELS[pieceKey])

      setLowStockPieceNames(lowStock)
    } catch (error) {
      console.error("Error al validar inventario del dia:", error)
      setIsInventoryReadyForToday(true)
      setTotalAvailablePieces(null)
      setLowStockPieceNames([])
    } finally {
      setIsCheckingInventoryStatus(false)
    }
  }, [])

  useEffect(() => {
    loadOrderCorrectionDraft()
  }, [loadOrderCorrectionDraft])

  useEffect(() => {
    if (activeTab !== "POS") {
      return
    }

    const draft = getOrderCorrectionDraftFromStorage()

    if (!draft) {
      return
    }

    setOrderCorrectionDraft(draft)

    setCart((currentCart) => {
      if (currentCart.length > 0) {
        return currentCart
      }

      const nextCart = draft.details.map((detail, index) =>
        createCartItemFromCorrectionDetail(detail, index),
      )

      if (nextCart.length === 0) {
        return currentCart
      }

      setTipoPedido(draft.tipo_pedido === "domicilio" ? "domicilio" : "mostrador")
      setMetodoPago(draft.metodo_pago === "transferencia" ? "transferencia" : "efectivo")
      setEstadoPago(draft.estado_pago === "pendiente" ? "pendiente" : "pagado")

      if (draft.customer?.id && draft.customer?.nombre && draft.customer?.telefono) {
        setSelectedCustomer({
          id: draft.customer.id,
          nombre: draft.customer.nombre,
          telefono: draft.customer.telefono,
          url_foto_fachada: null,
          foto_valida: false,
          latitud: null,
          longitud: null,
          direccion_habitual: draft.customer.direccion_habitual,
          referencias: draft.customer.referencias,
          notas_entrega: draft.customer.notas_entrega,
        })
      } else {
        setSelectedCustomer(null)
      }

      return nextCart
    })
  }, [activeTab])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key) {
        loadOrderCorrectionDraft()
      }
    }

    window.addEventListener("storage", handleStorage)

    return () => {
      window.removeEventListener("storage", handleStorage)
    }
  }, [loadOrderCorrectionDraft])

  useEffect(() => {
    if (tipoPedido === "mostrador") {
      setEstadoPago("pagado")
      return
    }

    setEstadoPago("pendiente")
  }, [tipoPedido])

  useEffect(() => {
    void checkTodayInventoryStatus(todayIsoDate)
  }, [checkTodayInventoryStatus, todayIsoDate])

  const handleAdminLogin = useCallback(async () => {
    if (!adminEmail.trim() || !adminPassword) {
      toast.error("Captura correo y contrasena")
      return
    }

    try {
      setIsSubmittingAdminAccess(true)

      const { error } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPassword,
      })

      if (error) {
        throw error
      }

      await refreshAdminAccess()
      setAdminPassword("")
      toast.success("Sesion de administrador iniciada")
    } catch (error) {
      console.error("Error al iniciar sesion admin:", error)
      toast.error("No se pudo iniciar sesion")
    } finally {
      setIsSubmittingAdminAccess(false)
    }
  }, [adminEmail, adminPassword, refreshAdminAccess])

  const handleAdminLogout = useCallback(async () => {
    try {
      setIsSubmittingAdminAccess(true)

      const { error } = await supabase.auth.signOut()

      if (error) {
        throw error
      }

      setAdminAccess(DEFAULT_ADMIN_ACCESS)
      setAdminPassword("")
      setIsPosAdminPanelOpen(false)
      toast.success("Sesion cerrada")
    } catch (error) {
      console.error("Error al cerrar sesion admin:", error)
      toast.error("No se pudo cerrar sesion")
    } finally {
      setIsSubmittingAdminAccess(false)
    }
  }, [])

  useEffect(() => {
    void refreshAdminAccess()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshAdminAccess()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [refreshAdminAccess])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const nextDate = getTodayLocalISODate()

      setTodayIsoDate((currentDate) =>
        currentDate === nextDate ? currentDate : nextDate,
      )
    }, 60000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    const handleFocus = () => {
      const nextDate = getTodayLocalISODate()

      setTodayIsoDate(nextDate)
      void checkTodayInventoryStatus(nextDate)
    }

    window.addEventListener("focus", handleFocus)

    return () => {
      window.removeEventListener("focus", handleFocus)
    }
  }, [checkTodayInventoryStatus])

  useEffect(() => {
    if (!isPosAdminPanelOpen) {
      return
    }

    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!posAdminPanelRef.current) {
        return
      }

      if (!posAdminPanelRef.current.contains(event.target as Node)) {
        setIsPosAdminPanelOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPosAdminPanelOpen(false)
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown)
    window.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown)
      window.removeEventListener("keydown", handleEscape)
    }
  }, [isPosAdminPanelOpen])

  useEffect(() => {
    if (isMoreMenuOpen || isCheckoutModalOpen || isDispatchPromptOpen || activeTab !== "POS") {
      setIsPosAdminPanelOpen(false)
    }
  }, [activeTab, isCheckoutModalOpen, isDispatchPromptOpen, isMoreMenuOpen])

  function handleAddToCart(producto: Producto) {
    setCart((currentCart) => [
      ...currentCart,
      {
        lineId: `${producto.id}-${currentCart.length + 1}-${Date.now()}`,
        producto,
        merma: null,
        threeQuarterVariant: isThreeQuarterProduct(producto)
          ? "ala_pechuga"
          : null,
        manualPieceSelection: [],
      },
    ])
  }

  function handleMermaChange(lineId: string, merma: string) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.lineId === lineId
          ? { ...item, merma: merma === "" ? null : merma }
          : item,
      ),
    )
  }

  function handleThreeQuarterVariantChange(
    lineId: string,
    variant: ThreeQuarterVariant,
  ) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.lineId === lineId
          ? { ...item, threeQuarterVariant: variant }
          : item,
      ),
    )
  }

function handleManualPieceSelectionChange(
    lineId: string,
    pieceType: InventoryPieceKey,
    mode: "add" | "remove",
  ) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.lineId === lineId
          ? {
              ...item,
              manualPieceSelection: (() => {
                const requiredPieces = getManualPieceRequirement(item.producto)
                const productConfig = getInventoryDiscountConfig(item.producto)

                if (!requiredPieces) {
                  return item.manualPieceSelection
                }

                if (!productConfig.piezasPermitidas.includes(pieceType)) {
                  return item.manualPieceSelection
                }

                if (mode === "add") {
                  if (!canAddManualPiece(item, pieceType, requiredPieces)) {
                    return item.manualPieceSelection
                  }

                  return [...item.manualPieceSelection, pieceType]
                }

                const pieceIndex = item.manualPieceSelection.indexOf(pieceType)

                if (pieceIndex === -1) {
                  return item.manualPieceSelection
                }

                return item.manualPieceSelection.filter(
                  (_, index) => index !== pieceIndex,
                )
              })(),
            }
          : item,
      ),
    )
  }

  function handleRemoveFromCart(indexToRemove: number) {
    setCart((currentCart) =>
      currentCart.filter((_, index) => index !== indexToRemove),
    )
  }

  function handleRemoveLastFromCart() {
    setCart((currentCart) => {
      if (currentCart.length === 0) {
        return currentCart
      }

      const nextCart = currentCart.slice(0, -1)
      const removedItem = currentCart[currentCart.length - 1]

      if (openMermaItemId === removedItem?.lineId) {
        setOpenMermaItemId(null)
      }

      if (nextCart.length === 0) {
        setIsCheckoutModalOpen(false)
      }

      return nextCart
    })
  }

  function toggleMerma(lineId: string) {
    setOpenMermaItemId((currentId) => (currentId === lineId ? null : lineId))
  }

  function buildCheckoutDetails(cartItems: CartItem[]) {
    return cartItems.map((item) => {
      if (item.correctionDetail) {
        const detail = item.correctionDetail

        return {
          producto_uuid: isUuid(detail.producto_id ?? "") ? detail.producto_id : null,
          producto_codigo: detail.producto_codigo,
          producto_nombre: detail.producto_nombre,
          descripcion: detail.descripcion,
          cantidad: detail.cantidad,
          precio_unitario: detail.precio_unitario,
          subtotal: detail.subtotal,
          piezas_inventario: getPiecesFromCorrectionDetail(detail),
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

      const detalle = getProductoDetalle(item.producto)
      const breakdown = getCartItemBreakdown(item)
      const mermaBreakdown = getCartItemMermaBreakdown(item)

      return {
        producto_uuid: isUuid(item.producto.id) ? item.producto.id : null,
        producto_codigo:
          resolveInventoryProductKey(item.producto) ?? item.producto.id,
        producto_nombre: item.producto.nombre,
        descripcion: item.producto.descripcion,
        cantidad: 1,
        precio_unitario: item.producto.precio,
        subtotal: item.producto.precio,
        piezas_inventario: detalle.piezasInventario,
        variante_3_4: item.threeQuarterVariant,
        merma_descripcion: item.merma,
        alas: breakdown.alas,
        piernas: breakdown.piernas,
        muslos: breakdown.muslos,
        pechugas_grandes: breakdown.pechugas_grandes,
        pechugas_chicas: breakdown.pechugas_chicas,
        merma_alas: mermaBreakdown.alas,
        merma_piernas: mermaBreakdown.piernas,
        merma_muslos: mermaBreakdown.muslos,
        merma_pechugas_grandes: mermaBreakdown.pechugas_grandes,
        merma_pechugas_chicas: mermaBreakdown.pechugas_chicas,
      }
    })
  }

  function validateCheckout() {
    if (cart.length === 0 || isCheckingOut) {
      return false
    }

    if (
      cart.some(
        (item) => {
          const requiredPieces = getManualPieceRequirement(item.producto)
          const config = getInventoryDiscountConfig(item.producto)

          if (!requiredPieces) {
            return false
          }

          const hasInvalidPiece = item.manualPieceSelection.some(
            (piece) => !config.piezasPermitidas.includes(piece),
          )

          if (hasInvalidPiece) {
            return true
          }

          if (!config.permiteRepetirPiezas) {
            const selectedUniquePieces = new Set(item.manualPieceSelection)

            if (selectedUniquePieces.size !== item.manualPieceSelection.length) {
              return true
            }
          }

          return item.manualPieceSelection.length !== requiredPieces
        },
      )
    ) {
      toast.error(
        "Completa la seleccion de piezas en productos que requieren asignacion manual",
      )
      return false
    }

    if (tipoPedido === "domicilio" && !selectedCustomer) {
      toast.error("Selecciona un cliente para pedidos a domicilio")
      return false
    }

    if (isRetroactiveModeEnabled) {
      if (!adminAccess.isAdmin) {
        toast.error("Solo un administrador puede registrar ventas retroactivas")
        return false
      }

      if (orderCorrectionDraft) {
        toast.error("No se puede combinar correccion con venta retroactiva")
        return false
      }

      const parsedTargetDate = new Date(retroactiveDateTimeLocal)

      if (!retroactiveDateTimeLocal || Number.isNaN(parsedTargetDate.getTime())) {
        toast.error("Selecciona una fecha y hora valida para la venta retroactiva")
        return false
      }

      if (retroactiveReason.trim().length < 4) {
        toast.error("Escribe un motivo retroactivo de al menos 4 caracteres")
        return false
      }
    }

    return true
  }

  async function notifyDispatchAfterCheckout(
    pedidoId: string,
    orderTotal: number,
    customerName: string | null,
  ) {
    const { error } = await supabase
      .from("pedidos")
      .update({ estado: "en_camino" })
      .eq("id", pedidoId)

    if (error) {
      throw error
    }

    const pushResult = await sendDispatchPushNotification({
      title: "Nuevo pedido en camino",
      body: `${customerName ?? "Cliente"} - ${currencyFormatter.format(orderTotal)}`,
      data: {
        pedidoId,
        tipoPedido: "domicilio",
      },
    })

    if (!pushResult.delivered) {
      toast("Pedido enviado, pero no hay dispositivo registrado para push", {
        icon: "i",
      })
    }
  }

  async function handleCheckout(sendDispatchNotification = false) {
    if (!validateCheckout()) {
      return
    }

    try {
      setIsCheckingOut(true)
      setIsDispatchPromptOpen(false)
      const checkoutDetails = buildCheckoutDetails(cart)
      const posSupabase = supabase as typeof supabase & {
        rpc: {
          (
            fn: "registrar_venta_pos",
            args: {
              p_total: number
              p_tipo_pedido: string
              p_metodo_pago: string
          p_estado_pago: string
          p_cliente_id: string | null
          p_estado: string | null
          p_fecha: string
          p_pedido_corregido_de_id: string | null
          p_detalles: ReturnType<typeof buildCheckoutDetails>
        },
          ): Promise<{
            data: RegistrarVentaPosResult | null
            error: Error | null
          }>
          (
            fn: "registrar_venta_pos_retroactiva_supervisada",
            args: {
              p_total: number
              p_tipo_pedido: string
              p_metodo_pago: string
              p_estado_pago: string
              p_cliente_id: string | null
              p_estado: string | null
              p_fecha_hora_objetivo: string
              p_motivo: string
              p_detalles: ReturnType<typeof buildCheckoutDetails>
            },
          ): Promise<{
            data: RegistrarVentaPosResult | null
            error: Error | null
          }>
          (
            fn: "get_printable_order",
            args: { p_pedido_id: string },
          ): Promise<{
            data: PrintableOrder | null
            error: Error | null
          }>
        }
      }

      const pedidoPayload: PedidoInsert = {
        total,
        cliente_id: selectedCustomer?.id ?? null,
        tipo_pedido: tipoPedido,
        metodo_pago: metodoPago,
        estado_pago: tipoPedido === "mostrador" ? "pagado" : estadoPago,
        estado: tipoPedido === "mostrador" ? "entregado" : "en_preparacion",
      }
      const checkoutInventoryDate = getCheckoutInventoryDate(orderCorrectionDraft)
      const isRetroactiveCheckout = isRetroactiveModeEnabled && !orderCorrectionDraft
      const retroactiveTargetIso = isRetroactiveCheckout
        ? new Date(retroactiveDateTimeLocal).toISOString()
        : null
      const retroactiveReasonTrimmed = retroactiveReason.trim()

      const { data: ventaGuardada, error } = isRetroactiveCheckout
        ? await posSupabase.rpc("registrar_venta_pos_retroactiva_supervisada", {
            p_total: pedidoPayload.total,
            p_tipo_pedido: pedidoPayload.tipo_pedido,
            p_metodo_pago: pedidoPayload.metodo_pago ?? "efectivo",
            p_estado_pago: pedidoPayload.estado_pago,
            p_cliente_id: pedidoPayload.cliente_id ?? null,
            p_estado: pedidoPayload.estado ?? null,
            p_fecha_hora_objetivo: retroactiveTargetIso ?? new Date().toISOString(),
            p_motivo: retroactiveReasonTrimmed,
            p_detalles: checkoutDetails,
          })
        : await posSupabase.rpc("registrar_venta_pos", {
            p_total: pedidoPayload.total,
            p_tipo_pedido: pedidoPayload.tipo_pedido,
            p_metodo_pago: pedidoPayload.metodo_pago ?? "efectivo",
            p_estado_pago: pedidoPayload.estado_pago,
            p_cliente_id: pedidoPayload.cliente_id ?? null,
            p_estado: pedidoPayload.estado ?? null,
            p_fecha: checkoutInventoryDate,
            p_pedido_corregido_de_id: orderCorrectionDraft?.original_pedido_id ?? null,
            p_detalles: checkoutDetails,
          })

      if (error) {
        throw error
      }

      if (!ventaGuardada?.pedido_id) {
        throw new Error("La venta se guardo sin devolver el pedido para impresion")
      }

      let dispatchStatus: "none" | "sent" | "failed" = "none"

      try {
        const { data: printableOrder, error: printableOrderError } =
          await posSupabase.rpc("get_printable_order", {
            p_pedido_id: ventaGuardada.pedido_id,
          })

        if (printableOrderError) {
          throw printableOrderError
        }

        if (!printableOrder) {
          throw new Error("No se pudo recuperar el pedido para impresion")
        }

        const ticketCocina = generarTextoTicket(printableOrder, true)
        const ticketCliente = generarTextoTicket(printableOrder, false)

        ejecutarImpresionBluetooth(ticketCocina)
        window.setTimeout(() => {
          ejecutarImpresionBluetooth(ticketCliente)
        }, 4000) // Retraso para evitar que ambas impresiones se mezclen
      } catch (printError) {
        console.error("Error al imprimir la venta:", printError)
        toast.error("Venta guardada, pero no se pudo imprimir el ticket")
      }

      if (tipoPedido === "domicilio" && sendDispatchNotification && !isRetroactiveCheckout) {
        try {
          await notifyDispatchAfterCheckout(
            ventaGuardada.pedido_id,
            pedidoPayload.total,
            selectedCustomer?.nombre ?? null,
          )
          dispatchStatus = "sent"
        } catch (dispatchError) {
          dispatchStatus = "failed"
          console.error("Error al notificar al repartidor:", dispatchError)
          toast.error("Venta guardada, pero no se pudo notificar al repartidor")
        }
      }

      setCart([])
      setIsCheckoutModalOpen(false)
      setOpenMermaItemId(null)
      setSelectedCustomer(null)
      setTipoPedido("mostrador")
      setMetodoPago("efectivo")
      setIsRetroactiveModeEnabled(false)
      setRetroactiveDateTimeLocal(formatNowForDateTimeLocalInput())
      setRetroactiveReason("")
      if (orderCorrectionDraft) {
        clearOrderCorrectionDraftFromStorage()
        setOrderCorrectionDraft(null)
      }
      showSaleSuccessToast(total, piezasInventario, dispatchStatus)
    } catch (error) {
      console.error("Error al registrar la venta:", error)
      const errorMessage = getErrorMessage(error)

      if (isMissingTodayInventoryError(errorMessage)) {
        setIsInventoryReadyForToday(false)
        toast.custom(
          () => (
            <div className="w-[min(92vw,24rem)] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
              <p className="text-sm font-semibold text-amber-900">
                Antes de cobrar, inicia el inventario de hoy.
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Te llevamos a INVENTARIO para registrarlo y volver a vender.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsCheckoutModalOpen(false)
                  setIsDispatchPromptOpen(false)
                  setActiveTab("INVENTARIO")
                  setIsMoreMenuOpen(false)
                }}
                className="mt-3 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-amber-700"
              >
                Ir a inventario
              </button>
            </div>
          ),
          { duration: 4000, position: "top-right" },
        )
      } else {
        toast.error(errorMessage)
      }
    } finally {
      setIsCheckingOut(false)
    }
  }

  function handleCheckoutPress() {
    if (!validateCheckout()) {
      return
    }

    if (isRetroactiveModeEnabled) {
      void handleCheckout(false)
      return
    }

    if (tipoPedido === "domicilio") {
      setIsDispatchPromptOpen(true)
      return
    }

    void handleCheckout(false)
  }

  const subtotal = cart.reduce(
    (currentTotal, item) => currentTotal + item.producto.precio,
    0,
  )
  const total = subtotal
  const piezasInventario = cart.reduce((currentTotal, item) => {
    const detalle = getProductoDetalle(item.producto)

    return currentTotal + detalle.piezasInventario + (item.merma ? 1 : 0)
  }, 0)
  const hasPendingManualPieceSelection = cart.some((item) => {
    const requiredPieces = getManualPieceRequirement(item.producto)
    const config = getInventoryDiscountConfig(item.producto)

    if (!requiredPieces) {
      return false
    }

    if (
      item.manualPieceSelection.some(
        (piece) => !config.piezasPermitidas.includes(piece),
      )
    ) {
      return true
    }

    if (!config.permiteRepetirPiezas) {
      const selectedUniquePieces = new Set(item.manualPieceSelection)

      if (selectedUniquePieces.size !== item.manualPieceSelection.length) {
        return true
      }
    }

    return item.manualPieceSelection.length !== requiredPieces
  })
  const isCheckoutDisabled =
    cart.length === 0 ||
    (tipoPedido === "domicilio" && !selectedCustomer) ||
    hasPendingManualPieceSelection ||
    isCheckingOut
  const menuIsActive =
    activeTab === "INVENTARIO" ||
    activeTab === "PRODUCTOS" ||
    activeTab === "CONTABILIDAD" ||
    activeTab === "CLIENTES" ||
    activeTab === "AUDITORIA" ||
    isMoreMenuOpen
  const correctionBannerText = orderCorrectionDraft
    ? `Corrigiendo pedido ${orderCorrectionDraft.short_order_id}`
    : null
  const adminAvatarRingClass = adminAccess.isAdmin
    ? "ring-emerald-500"
    : adminAccess.isAuthenticated
      ? "ring-amber-400"
      : "ring-gray-300"
  const adminAvatarStatusClass = adminAccess.isAdmin
    ? "bg-emerald-500"
    : adminAccess.isAuthenticated
      ? "bg-amber-400"
      : "bg-gray-300"
  const inventoryBadgeToneClass =
    totalAvailablePieces == null
      ? "border-slate-200 bg-white text-slate-500"
      : lowStockPieceNames.length > 0
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"

  const posHeaderAdminAction = (
    <div className="flex items-center gap-2">
      <div
        className={`inline-flex min-h-11 items-center rounded-full border px-3 py-2 text-right shadow-sm ${inventoryBadgeToneClass}`}
        title="Existencia total disponible en inventario del dia"
      >
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em]">Stock</p>
          <p className="text-sm font-black leading-none">
            {totalAvailablePieces == null ? "--" : `${totalAvailablePieces} pzs`}
          </p>
        </div>
      </div>

      <div className="relative" ref={posAdminPanelRef}>
        <button
          type="button"
          onClick={() => setIsPosAdminPanelOpen((current) => !current)}
          className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-2 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 ${adminAvatarRingClass}`}
          aria-label="Abrir acceso de administrador"
          aria-expanded={isPosAdminPanelOpen}
        >
          <span className="text-sm font-black uppercase" aria-hidden="true">
            {adminAccess.email?.[0]?.toUpperCase() ?? "A"}
          </span>
          <span
            className={`absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${adminAvatarStatusClass}`}
            aria-hidden="true"
          />
        </button>

        {isPosAdminPanelOpen ? (
          <div className="absolute right-0 top-[calc(100%+0.55rem)] z-30 w-[min(92vw,18rem)] rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-[0_20px_45px_rgba(15,23,42,0.18)]">
            {adminAccess.isAuthenticated ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Cuenta actual
                  </p>
                  <p className="mt-1.5 text-sm font-bold text-slate-900">
                    {adminAccess.email ?? "Sin correo"}
                  </p>
                  <p
                    className={`mt-2 text-xs font-semibold ${
                      adminAccess.isAdmin ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {adminAccess.isAdmin
                      ? "Permisos de administrador verificados"
                      : "Sesion iniciada, pero sin permisos de administrador"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleAdminLogout()}
                  disabled={isSubmittingAdminAccess}
                  className="w-full rounded-xl bg-slate-900 px-3 py-2 text-left text-xs font-black text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {isSubmittingAdminAccess ? "Cerrando sesion..." : "Cerrar sesion"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="admin-email"
                    className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500"
                  >
                    Correo
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    autoComplete="email"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-password"
                    className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500"
                  >
                    Contrasena
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    value={adminPassword}
                    onChange={(event) => setAdminPassword(event.target.value)}
                    autoComplete="current-password"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleAdminLogin()}
                  disabled={isSubmittingAdminAccess}
                  className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-black text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {isSubmittingAdminAccess ? "Entrando..." : "Entrar como admin"}
                </button>
              </div>
            )}

            <p className="mt-2 text-[11px] text-slate-500">
              {isLoadingAdminAccess
                ? "Validando estado de sesion..."
                : adminAccess.isAdmin
                  ? "Admin activo"
                  : adminAccess.isAuthenticated
                    ? "Sesion iniciada sin rol admin"
                    : "Sin sesion admin"}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <main className="min-h-screen overflow-x-clip bg-gray-100 p-4 pb-24 text-slate-900 sm:p-6 sm:pb-28">
      <Toaster
        position="top-right"
        containerStyle={{ top: 88, right: 16 }}
        toastOptions={{ duration: 2200 }}
      />

      <div className="mx-auto max-w-7xl">
        {activeTab === "POS" && !isCheckingInventoryStatus && !isInventoryReadyForToday ? (
          <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 shadow-sm sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Inventario pendiente
                </p>
                <p className="mt-1 text-sm font-semibold text-amber-900">
                  Inicia el inventario de hoy para habilitar ventas en caja.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("INVENTARIO")
                  setIsMoreMenuOpen(false)
                }}
                className="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-200"
              >
                Ir a inventario
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === "POS" && !isCheckingInventoryStatus && isInventoryReadyForToday && lowStockPieceNames.length > 0 ? (
          <section className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 shadow-sm sm:px-4 sm:py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
              Bajo stock
            </p>
            <p className="mt-1 text-xs font-medium text-rose-900 sm:text-sm">
              {lowStockPieceNames.join(", ")}
            </p>
          </section>
        ) : null}

        {activeTab === "POS" && correctionBannerText ? (
          <section className="mb-3 rounded-2xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 shadow-sm sm:px-4 sm:py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                {correctionBannerText}
              </p>
              <button
                type="button"
                onClick={() => {
                  clearOrderCorrectionDraftFromStorage()
                  setOrderCorrectionDraft(null)
                  toast("Borrador de correccion descartado", { icon: "i" })
                }}
                className="rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700 transition hover:bg-sky-100 focus:outline-none focus:ring-4 focus:ring-sky-100"
              >
                Limpiar
              </button>
            </div>
          </section>
        ) : null}

        <section className="mb-4">
          <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            <div className="flex min-w-max items-center gap-2">
              {SECONDARY_TAB_CHIPS.map((tab) => {
                const isActive = activeTab === tab.id

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id)
                      setIsMoreMenuOpen(false)
                    }}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] transition focus:outline-none focus:ring-4 ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_8px_20px_rgba(15,23,42,0.16)] focus:ring-slate-200"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 focus:ring-slate-100"
                    }`}
                    aria-pressed={isActive}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {activeTab === "POS" ? (
          <>
            <div className="flex h-[calc(100vh-80px)] flex-col overflow-hidden md:flex-row">
              <section className="flex-1 overflow-y-auto pb-24 md:w-[60%] md:pb-4">
                <POSMenu
                  onSelectProduct={handleAddToCart}
                  headerAction={posHeaderAdminAction}
                />
              </section>
            </div>

            {cart.length > 0 ? (
              <div className="fixed bottom-20 left-0 z-40 flex w-full items-center justify-between rounded-t-xl bg-gray-900 p-4 text-white shadow-[0_-18px_40px_rgba(15,23,42,0.22)] sm:bottom-24">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRemoveLastFromCart}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg font-black text-white transition hover:bg-white/20 focus:outline-none focus:ring-4 focus:ring-white/20"
                    aria-label="Quitar ultimo producto"
                  >
                    -
                  </button>
                  <p className="text-sm font-bold">
                    {cart.length} producto{cart.length === 1 ? "" : "s"} -{" "}
                    {currencyFormatter.format(total)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCheckoutModalOpen(true)}
                  className="rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-white/30"
                >
                  Ir a Cobrar
                </button>
              </div>
            ) : null}

            {isCheckoutModalOpen && !isDispatchPromptOpen ? (
              <div className="fixed inset-0 z-[60] overflow-y-auto bg-white p-4">
                <div className="mx-auto flex min-h-full max-w-3xl flex-col">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Cobro
                      </p>
                      <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                        Ticket de venta
                      </h1>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCheckoutModalOpen(false)}
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
                    >
                      Volver
                    </button>
                  </div>

                  <div className="flex flex-1 flex-col">
                    {tipoPedido === "domicilio" ? (
                      <CustomerSelector
                        onCustomerSelect={setSelectedCustomer}
                        tipoPedido={tipoPedido}
                        onTipoPedidoChange={setTipoPedido}
                      />
                    ) : (
                      <section className="space-y-4">
                        <div className="rounded-[1.75rem] bg-slate-50 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 sm:p-5">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                              Tipo de pedido
                            </p>
                            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                              Cliente y entrega
                            </h2>
                          </div>
                          <div className="mt-4 rounded-[1.4rem] bg-white p-1.5 ring-1 ring-slate-200">
                            <div className="grid grid-cols-2 gap-1.5">
                              {(["mostrador", "domicilio"] as const).map((tipo) => {
                                const isActive = tipoPedido === tipo

                                return (
                                  <button
                                    key={tipo}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCustomer(null)
                                      setTipoPedido(tipo)
                                    }}
                                    className={`min-w-0 rounded-[1.2rem] px-3 py-3 text-center text-sm font-bold capitalize transition sm:px-5 ${
                                      isActive
                                        ? "bg-slate-900 text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)]"
                                        : "text-slate-500 hover:bg-white hover:text-slate-900"
                                    }`}
                                  >
                                    <span className="block truncate">{tipo}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>

                        <OptionalCheckoutCustomerPicker
                          selectedCustomer={selectedCustomer}
                          onCustomerSelect={setSelectedCustomer}
                        />
                      </section>
                    )}

                    <div className="mt-4 border-b border-dashed border-slate-200 pb-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Factura
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {cart.length} producto{cart.length === 1 ? "" : "s"} agregado
                        {cart.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    {adminAccess.isAdmin && !orderCorrectionDraft ? (
                      <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
                              Captura retroactiva
                            </p>
                            <p className="mt-1 text-xs text-amber-700/85">
                              Para pedidos de libreta no registrados; impacta inventario historico.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsRetroactiveModeEnabled((current) => !current)
                              if (!isRetroactiveModeEnabled) {
                                setRetroactiveDateTimeLocal(formatNowForDateTimeLocalInput())
                              }
                            }}
                            className={`rounded-2xl px-3 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                              isRetroactiveModeEnabled
                                ? "bg-amber-700 text-white"
                                : "bg-white text-amber-700 ring-1 ring-amber-300 hover:bg-amber-100"
                            }`}
                          >
                            {isRetroactiveModeEnabled ? "Activa" : "Activar"}
                          </button>
                        </div>

                        {isRetroactiveModeEnabled ? (
                          <div className="mt-3 space-y-3">
                            <label className="block">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                                Fecha y hora real
                              </span>
                              <input
                                type="datetime-local"
                                value={retroactiveDateTimeLocal}
                                onChange={(event) =>
                                  setRetroactiveDateTimeLocal(event.target.value)
                                }
                                className="mt-1.5 w-full rounded-2xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                                Motivo (auditoria)
                              </span>
                              <input
                                type="text"
                                value={retroactiveReason}
                                onChange={(event) => setRetroactiveReason(event.target.value)}
                                placeholder="Ej: pedido de libreta no capturado"
                                className="mt-1.5 w-full rounded-2xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400"
                              />
                            </label>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                              Si no existe inventario ese dia, se autocrea con stock anterior 0.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex-1 space-y-3 overflow-y-auto py-4">
                      {cart.length === 0 ? (
                        <div className="flex h-full min-h-64 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm leading-relaxed text-slate-500">
                          El ticket esta vacio. Toca un producto del menu para agregarlo a la venta.
                        </div>
                      ) : (
                        cart.map((item, index) => {
                          const detalle = getProductoDetalle(item.producto)
                          const showMermaPanel = openMermaItemId === item.lineId
                          const showThreeQuarterSelector =
                            !item.correctionDetail && isThreeQuarterProduct(item.producto)
                          const manualPieceRequirement = getManualPieceRequirement(
                            item.producto,
                          )
                          const manualConfig = getInventoryDiscountConfig(item.producto)
                          const showManualPieceSelector =
                            !item.correctionDetail && manualPieceRequirement !== null
                          const selectedCompositionLabel = getManualSelectionLabel(
                            item.manualPieceSelection,
                          )

                          return (
                            <article
                              key={item.lineId}
                              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h2 className="text-base font-bold text-slate-900">
                                    {item.producto.nombre}
                                  </h2>
                                  <p className="mt-1 text-sm text-slate-500">
                                    {item.producto.descripcion}
                                  </p>
                                  {detalle.desglose ? (
                                    <p className="mt-1 text-xs text-slate-400">
                                      Desglose: {detalle.desglose}
                                    </p>
                                  ) : null}
                                  {item.correctionDetail ? (
                                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
                                      Item recuperado del pedido original
                                    </p>
                                  ) : null}
                                  {showThreeQuarterSelector &&
                                  item.threeQuarterVariant ? (
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
                                      Variante:{" "}
                                      {
                                        THREE_QUARTER_VARIANT_LABELS[
                                          item.threeQuarterVariant
                                        ]
                                      }
                                    </p>
                                  ) : null}
                                  {showManualPieceSelector ? (
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
                                      Composicion:{" "}
                                      {selectedCompositionLabel ||
                                        "Pendiente por seleccionar"}
                                    </p>
                                  ) : null}
                                  {item.merma ? (
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">
                                      Merma registrada: {item.merma}
                                    </p>
                                  ) : null}
                                </div>
                                <span className="shrink-0 text-base font-black text-slate-900">
                                  {currencyFormatter.format(item.producto.precio)}
                                </span>
                              </div>

                              <div className="mt-4 space-y-3">
                                {showThreeQuarterSelector ? (
                                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                                      Selecciona la combinacion del 3/4
                                    </p>
                                    <div className="mt-3 grid gap-2">
                                      {(
                                        Object.keys(
                                          THREE_QUARTER_VARIANT_LABELS,
                                        ) as ThreeQuarterVariant[]
                                      ).map((variant) => {
                                        const isActive =
                                          item.threeQuarterVariant === variant

                                        return (
                                          <button
                                            key={variant}
                                            type="button"
                                            onClick={() =>
                                              handleThreeQuarterVariantChange(
                                                item.lineId,
                                                variant,
                                              )
                                            }
                                            className={`rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${
                                              isActive
                                                ? "bg-slate-900 text-white"
                                                : "bg-white text-slate-700 ring-1 ring-amber-200 hover:bg-amber-100"
                                            }`}
                                          >
                                            {THREE_QUARTER_VARIANT_LABELS[variant]}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ) : null}

                                {showManualPieceSelector && manualPieceRequirement ? (
                                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                                      Selecciona {manualPieceRequirement} pieza
                                      {manualPieceRequirement === 1 ? "" : "s"} a descontar
                                    </p>
                                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-500">
                                      {item.manualPieceSelection.length}/{manualPieceRequirement} asignada
                                      {item.manualPieceSelection.length === 1 ? "" : "s"}
                                    </p>
                                    <div className="mt-3 grid gap-2">
                                      {manualConfig.piezasPermitidas.map((pieceKey) => {
                                        const selectedCount =
                                          item.manualPieceSelection.filter(
                                            (selectedPiece) =>
                                              selectedPiece === pieceKey,
                                          ).length
                                        const canAdd = canAddManualPiece(
                                          item,
                                          pieceKey,
                                          manualPieceRequirement,
                                        )
                                        const canRemove = selectedCount > 0

                                        return (
                                          <div
                                            key={pieceKey}
                                            className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-sky-200"
                                          >
                                            <p className="font-bold text-slate-700">
                                              {PIECE_LABELS[pieceKey]}
                                            </p>
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleManualPieceSelectionChange(
                                                    item.lineId,
                                                    pieceKey,
                                                    "remove",
                                                  )
                                                }
                                                disabled={!canRemove}
                                                className="h-8 w-8 rounded-xl bg-sky-100 text-base font-black text-sky-700 transition hover:bg-sky-200 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                                aria-label={`Quitar ${PIECE_LABELS[pieceKey]}`}
                                              >
                                                -
                                              </button>
                                              <span className="inline-flex min-w-8 items-center justify-center rounded-xl bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">
                                                {selectedCount}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleManualPieceSelectionChange(
                                                    item.lineId,
                                                    pieceKey,
                                                    "add",
                                                  )
                                                }
                                                disabled={!canAdd}
                                                className="h-8 w-8 rounded-xl bg-sky-600 text-base font-black text-white transition hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                                aria-label={`Agregar ${PIECE_LABELS[pieceKey]}`}
                                              >
                                                +
                                              </button>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ) : null}

                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                    {detalle.piezasInventario} pzs salen de inventario
                                    {item.merma ? " + 1 reposicion" : ""}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveFromCart(index)}
                                      className="px-2 py-1 text-xs font-semibold text-rose-500 transition hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-100"
                                    >
                                      Eliminar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleMerma(item.lineId)}
                                      className="rounded-2xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 focus:outline-none focus:ring-4 focus:ring-rose-100"
                                    >
                                      Merma
                                    </button>
                                  </div>
                                </div>

                                {showMermaPanel ? (
                                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                    <label
                                      htmlFor={`merma-${item.lineId}`}
                                      className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                                    >
                                      Pieza defectuosa
                                    </label>
                                    <select
                                      id={`merma-${item.lineId}`}
                                      value={item.merma ?? ""}
                                      onChange={(event) =>
                                        handleMermaChange(
                                          item.lineId,
                                          event.target.value,
                                        )
                                      }
                                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                    >
                                      <option value="">Sin merma</option>
                                      {detalle.mermaOptions.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : null}
                              </div>
                            </article>
                          )
                        })
                      )}
                    </div>

                    <div className="mt-auto border-t border-dashed border-slate-200 pt-4">
                      <div className="tablet-compact-panel mb-4 space-y-4 rounded-3xl bg-slate-50 p-5">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Metodo de pago
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {([
                              { id: "efectivo", label: "Efectivo" },
                              { id: "transferencia", label: "Transferencia" },
                            ] as const).map((option) => {
                              const isActive = metodoPago === option.id

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => setMetodoPago(option.id)}
                                  className={`tablet-compact-toggle rounded-2xl px-4 py-3 text-sm font-bold transition ${
                                    isActive
                                      ? "bg-slate-900 text-white shadow-[0_10px_25px_rgba(15,23,42,0.16)]"
                                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Estado de pago
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {([
                              { id: "pagado", label: "Pagado" },
                              { id: "pendiente", label: "Pendiente" },
                            ] as const).map((option) => {
                              const isActive = estadoPago === option.id

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => setEstadoPago(option.id)}
                                  className={`tablet-compact-toggle rounded-2xl px-4 py-3 text-sm font-bold transition ${
                                    isActive
                                      ? option.id === "pagado"
                                        ? "bg-emerald-600 text-white shadow-[0_10px_25px_rgba(5,150,105,0.22)]"
                                        : "bg-rose-600 text-white shadow-[0_10px_25px_rgba(225,29,72,0.22)]"
                                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="tablet-compact-panel space-y-3 rounded-3xl bg-slate-50 p-5">
                        <div className="flex items-center justify-between text-sm text-slate-500">
                          <span>Subtotal</span>
                          <span className="font-semibold text-slate-900">
                            {currencyFormatter.format(subtotal)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-500">
                          <span>Piezas fisicas</span>
                          <span className="font-semibold text-slate-900">
                            {piezasInventario} pzs
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-lg font-black text-slate-900">
                          <span>Total</span>
                          <span>{currencyFormatter.format(total)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCheckoutPress}
                        disabled={isCheckoutDisabled}
                        className="tablet-compact-checkout mt-5 w-full rounded-3xl bg-slate-900 px-6 py-5 text-lg font-black text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                      >
                        {isCheckingOut
                          ? "Registrando venta..."
                          : isRetroactiveModeEnabled
                            ? `Registrar Retroactiva (${piezasInventario} pzs)`
                            : `Confirmar Venta (${piezasInventario} pzs)`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : activeTab === "MONITOR" ? (
          <OrdersMonitor onStartCorrection={handleStartCorrectionFromMonitor} />
        ) : activeTab === "CLIENTES" ? (
          <div className="-mx-4 -mb-4 sm:-mx-6">
            <AdminClientes />
          </div>
        ) : activeTab === "INVENTARIO" ? (
          <InventoryManager
            onInventoryStarted={() => {
              const currentDate = getTodayLocalISODate()

              setTodayIsoDate(currentDate)
              void checkTodayInventoryStatus(currentDate)
            }}
          />
        ) : activeTab === "CONTABILIDAD" ? (
          <AccountingDashboard />
        ) : activeTab === "AUDITORIA" ? (
          <AuditLog />
        ) : (
          <ProductCatalogManager />
        )}
      </div>

      {isMoreMenuOpen ? (
        <div className="tablet-compact-menu fixed inset-x-4 bottom-24 z-50 rounded-[1.5rem] border border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.16)] sm:inset-x-auto sm:right-6 sm:w-[18rem] sm:bottom-28">
          {SECONDARY_TAB_CHIPS.map((tab) => {
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id)
                  setIsMoreMenuOpen(false)
                }}
                className={`tablet-compact-toggle flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>{tab.label}</span>
                {isActive ? (
                  <span className="text-xs uppercase tracking-[0.18em]">
                    Activo
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      <nav className="tablet-compact-nav fixed bottom-0 left-0 z-50 w-full border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-around px-2 py-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab("POS")
              setIsMoreMenuOpen(false)
            }}
            className={`tablet-compact-nav-button flex min-w-[72px] flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition ${
              activeTab === "POS" ? "text-slate-900" : "text-gray-400"
            }`}
            aria-current={activeTab === "POS" ? "page" : undefined}
          >
            <VentaIcon className="h-5 w-5" />
            <span className="text-[10px] font-bold">Venta</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("MONITOR")
              setIsMoreMenuOpen(false)
            }}
            className={`tablet-compact-nav-button flex min-w-[72px] flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition ${
              activeTab === "MONITOR" ? "text-slate-900" : "text-gray-400"
            }`}
            aria-current={activeTab === "MONITOR" ? "page" : undefined}
          >
            <PedidosIcon className="h-5 w-5" />
            <span className="text-[10px] font-bold">Pedidos</span>
          </button>

          <button
            type="button"
            onClick={() => setIsMoreMenuOpen((current) => !current)}
            className={`tablet-compact-nav-button flex min-w-[72px] flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition ${
              menuIsActive ? "text-slate-900" : "text-gray-400"
            }`}
            aria-expanded={isMoreMenuOpen}
            aria-label="Abrir menu"
          >
            <MenuIcon className="h-5 w-5" />
            <span className="text-[10px] font-bold">Menu</span>
          </button>
        </div>
      </nav>

      {isDispatchPromptOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] sm:items-center">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)] ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-600">
              Pedido a domicilio
            </p>
            <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-900">
              Quieres avisar al repartidor ahora?
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Si eliges enviar, el pedido se marcara en camino y se mandara la
              notificacion sin pasar por la pestaña de pedidos.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => void handleCheckout(true)}
                disabled={isCheckingOut}
                className="w-full rounded-2xl bg-slate-900 px-5 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
              >
                Guardar y notificar
              </button>
              <button
                type="button"
                onClick={() => void handleCheckout(false)}
                disabled={isCheckingOut}
                className="w-full rounded-2xl bg-slate-100 px-5 py-4 text-sm font-bold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                Guardar sin notificar
              </button>
              <button
                type="button"
                onClick={() => setIsDispatchPromptOpen(false)}
                disabled={isCheckingOut}
                className="w-full rounded-2xl px-5 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
