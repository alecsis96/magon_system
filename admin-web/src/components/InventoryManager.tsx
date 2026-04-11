import { useCallback, useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import {
  PIECE_LABELS,
  PIEZAS_POR_POLLO,
  type InventoryPieceKey,
} from "../constants/inventory"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import { registrarEventoAuditoriaBestEffort } from "../lib/audit"
import { formatDateTime, getTodayDateKey } from "../lib/datetime"
import { supabase } from "../lib/supabase"
import type {
  InventarioDiario,
  InventarioDiarioInsert,
  InventarioDiarioUpdate,
  InventarioMovimiento,
  InventarioMovimientoInsert,
} from "../types/database"

type MermaType = "caidos" | "quemados"
type OperationTab = "proveedor" | "mermas" | "ajustes"
type PieceStockAllocation = Record<InventoryPieceKey, number>
const TOTAL_PIEZAS_POR_POLLO = Object.values(PIEZAS_POR_POLLO).reduce(
  (total, value) => total + value,
  0,
)

const PIECE_FIELD_MAP: Record<
  InventoryPieceKey,
  keyof Pick<
    InventarioDiario,
    | "ventas_alas"
    | "ventas_piernas"
    | "ventas_muslos"
    | "ventas_pechugas_g"
    | "ventas_pechugas_c"
  >
> = {
  alas: "ventas_alas",
  piernas: "ventas_piernas",
  muslos: "ventas_muslos",
  pechugas_grandes: "ventas_pechugas_g",
  pechugas_chicas: "ventas_pechugas_c",
}

const PIECE_KEYS = Object.keys(PIECE_LABELS) as InventoryPieceKey[]

const MERMA_FIELD_MAP: Record<
  InventoryPieceKey,
  keyof Pick<
    InventarioDiario,
    | "mermas_alas"
    | "mermas_piernas"
    | "mermas_muslos"
    | "mermas_pechugas_g"
    | "mermas_pechugas_c"
  >
> = {
  alas: "mermas_alas",
  piernas: "mermas_piernas",
  muslos: "mermas_muslos",
  pechugas_grandes: "mermas_pechugas_g",
  pechugas_chicas: "mermas_pechugas_c",
}

const AJUSTE_FIELD_MAP: Record<
  InventoryPieceKey,
  keyof Pick<
    InventarioDiario,
    | "ajustes_alas"
    | "ajustes_piernas"
    | "ajustes_muslos"
    | "ajustes_pechugas_g"
    | "ajustes_pechugas_c"
  >
> = {
  alas: "ajustes_alas",
  piernas: "ajustes_piernas",
  muslos: "ajustes_muslos",
  pechugas_grandes: "ajustes_pechugas_g",
  pechugas_chicas: "ajustes_pechugas_c",
}

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

function getTodayLocalISODate() {
  return getTodayDateKey()
}

function getTotalEnParrilla(inventario: InventarioDiario) {
  return (inventario.stock_anterior ?? 0) + (inventario.nuevos_ingresos ?? 0)
}

function getPieceStockSourceTotal(inventario: InventarioDiario) {
  return PIECE_KEYS.reduce((total, pieceKey) => {
    const stockField = PIECE_STOCK_FIELD_MAP[pieceKey]
    const stockValue = inventario[stockField]
    return total + (typeof stockValue === "number" ? Math.round(stockValue) : 0)
  }, 0)
}

function hasPieceStockSource(inventario: InventarioDiario) {
  return PIECE_KEYS.every((pieceKey) => {
    const stockField = PIECE_STOCK_FIELD_MAP[pieceKey]
    return typeof inventario[stockField] === "number"
  })
}

function getInventorySoldPieces(inventario: InventarioDiario) {
  const soldPieces =
    (inventario.ventas_alas ?? 0) +
    (inventario.ventas_piernas ?? 0) +
    (inventario.ventas_muslos ?? 0) +
    (inventario.ventas_pechugas_g ?? 0) +
    (inventario.ventas_pechugas_c ?? 0)

  return soldPieces
}

function getInventoryMermaPieces(inventario: InventarioDiario) {
  return (
    (inventario.mermas_alas ?? 0) +
    (inventario.mermas_piernas ?? 0) +
    (inventario.mermas_muslos ?? 0) +
    (inventario.mermas_pechugas_g ?? 0) +
    (inventario.mermas_pechugas_c ?? 0)
  )
}

function getInventoryAdjustmentPieces(inventario: InventarioDiario) {
  return (
    (inventario.ajustes_alas ?? 0) +
    (inventario.ajustes_piernas ?? 0) +
    (inventario.ajustes_muslos ?? 0) +
    (inventario.ajustes_pechugas_g ?? 0) +
    (inventario.ajustes_pechugas_c ?? 0)
  )
}

function getInventoryAdminAdjustmentPieces(inventario: InventarioDiario) {
  if (typeof inventario.ajustes_admin === "number") {
    return inventario.ajustes_admin
  }

  return getInventoryAdjustmentPieces(inventario)
}

function getStockFinalPieces(inventario: InventarioDiario) {
  if (hasPieceStockSource(inventario)) {
    return getPieceStockSourceTotal(inventario)
  }

  if (typeof inventario.stock_final === "number") {
    return inventario.stock_final
  }

  return (
    getTotalEnParrilla(inventario) -
    getInventorySoldPieces(inventario) -
    getInventoryMermaPieces(inventario) +
    getInventoryAdminAdjustmentPieces(inventario)
  )
}

function formatMetric(value: number) {
  return Math.round(value).toString()
}

function formatSignedMetric(value: number) {
  const formatted = formatMetric(Math.abs(value))

  if (value > 0) {
    return `+${formatted}`
  }

  if (value < 0) {
    return `-${formatted}`
  }

  return formatted
}

function formatInventoryDateTime(value: string | null) {
  if (!value) {
    return ""
  }

  return formatDateTime(value)
}

function getPieceStockEstimateLegacy(inventario: InventarioDiario, pieceKey: InventoryPieceKey) {
  const totalPiezas = getTotalEnParrilla(inventario)
  const ventasField = PIECE_FIELD_MAP[pieceKey]
  const mermasField = MERMA_FIELD_MAP[pieceKey]
  const ajustesField = AJUSTE_FIELD_MAP[pieceKey]
  const ventas = inventario[ventasField] ?? 0
  const mermas = inventario[mermasField] ?? 0
  const ajustes = inventario[ajustesField] ?? 0

  return (
    totalPiezas * (PIEZAS_POR_POLLO[pieceKey] / TOTAL_PIEZAS_POR_POLLO) -
    ventas -
    mermas +
    ajustes
  )
}

function getBalancedPieceStockAllocation(inventario: InventarioDiario) {
  const targetStock = Math.round(getStockFinalPieces(inventario))
  const allocation = Object.fromEntries(PIECE_KEYS.map((pieceKey) => [pieceKey, 0])) as Record<
    InventoryPieceKey,
    number
  >
  const estimates = PIECE_KEYS.map((pieceKey, index) => {
    const exact = getPieceStockEstimateLegacy(inventario, pieceKey)
    const floorValue = Math.floor(exact)

    allocation[pieceKey] = floorValue

    return {
      pieceKey,
      index,
      remainder: exact - floorValue,
    }
  })
  const floorTotal = PIECE_KEYS.reduce((total, pieceKey) => total + allocation[pieceKey], 0)
  let remainderPieces = targetStock - floorTotal

  if (remainderPieces > 0) {
    const incrementOrder = [...estimates].sort(
      (a, b) => b.remainder - a.remainder || a.index - b.index,
    )

    for (let index = 0; index < remainderPieces; index += 1) {
      const pieceKey = incrementOrder[index % incrementOrder.length].pieceKey
      allocation[pieceKey] += 1
    }
  } else if (remainderPieces < 0) {
    remainderPieces = Math.abs(remainderPieces)
    const decrementOrder = [...estimates].sort(
      (a, b) => a.remainder - b.remainder || a.index - b.index,
    )

    for (let index = 0; index < remainderPieces; index += 1) {
      const pieceKey = decrementOrder[index % decrementOrder.length].pieceKey
      allocation[pieceKey] -= 1
    }
  }

  return allocation
}

function getPieceStockAllocation(inventario: InventarioDiario) {
  if (hasPieceStockSource(inventario)) {
    return Object.fromEntries(
      PIECE_KEYS.map((pieceKey) => {
        const stockField = PIECE_STOCK_FIELD_MAP[pieceKey]
        return [pieceKey, Math.round((inventario[stockField] as number) ?? 0)]
      }),
    ) as Record<InventoryPieceKey, number>
  }

  return getBalancedPieceStockAllocation(inventario)
}

function getAllocatedPieceStock(inventario: InventarioDiario, pieceKey: InventoryPieceKey) {
  return getPieceStockAllocation(inventario)[pieceKey]
}

function allocateEvenPieces(totalPieces: number) {
  const base = Math.floor(totalPieces / PIECE_KEYS.length)
  const remainder = totalPieces % PIECE_KEYS.length
  const allocation = Object.fromEntries(PIECE_KEYS.map((pieceKey) => [pieceKey, base])) as Record<
    InventoryPieceKey,
    number
  >

  for (let index = 0; index < remainder; index += 1) {
    allocation[PIECE_KEYS[index]] += 1
  }

  return allocation
}

function allocateEvenPiecesWithSign(deltaPieces: number) {
  const sign = deltaPieces >= 0 ? 1 : -1
  const allocation = allocateEvenPieces(Math.abs(deltaPieces))

  for (const pieceKey of PIECE_KEYS) {
    allocation[pieceKey] *= sign
  }

  return allocation
}

function getStockSourcePayloadFromAllocation(allocation: PieceStockAllocation) {
  return {
    stock_alas: allocation.alas,
    stock_piernas: allocation.piernas,
    stock_muslos: allocation.muslos,
    stock_pechugas_g: allocation.pechugas_grandes,
    stock_pechugas_c: allocation.pechugas_chicas,
  }
}

function getStockSourceDeltaPayload(deltaPieces: number) {
  const allocation = allocateEvenPiecesWithSign(deltaPieces)

  return {
    stock_alas: allocation.alas,
    stock_piernas: allocation.piernas,
    stock_muslos: allocation.muslos,
    stock_pechugas_g: allocation.pechugas_grandes,
    stock_pechugas_c: allocation.pechugas_chicas,
  }
}

function parseNonNegativeInteger(value: string) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null
  }

  return parsed
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

function getMovementTitle(movement: InventarioMovimiento) {
  switch (movement.tipo_movimiento) {
    case "entrada_proveedor":
      return "Entrada de proveedor"
    case "devolucion_proveedor":
      return "Devolucion a proveedor"
    case "merma":
      return "Merma"
    case "ajuste_admin":
      return "Ajuste admin"
    case "cierre_turno":
      return "Cierre de turno"
    case "reapertura_admin":
      return "Reapertura admin"
    default:
      return movement.tipo_movimiento.replace(/_/g, " ")
  }
}

function getMovementQuantityLabel(movement: InventarioMovimiento) {
  if (typeof movement.cantidad_piezas === "number") {
    return `${formatSignedMetric(movement.cantidad_piezas)} pzs`
  }

  return `${formatSignedMetric(movement.cantidad_equivalente)} pzs`
}

function getMovementTone(movement: InventarioMovimiento) {
  if (movement.tipo_movimiento === "entrada_proveedor") {
    return "text-emerald-600"
  }

  if (movement.tipo_movimiento === "ajuste_admin") {
    return "text-sky-600"
  }

  if (movement.tipo_movimiento === "cierre_turno" || movement.tipo_movimiento === "reapertura_admin") {
    return "text-slate-600"
  }

  return "text-rose-600"
}
function OperationTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2.5 text-center text-sm font-black leading-tight transition focus:outline-none focus:ring-4 focus:ring-slate-200 ${
        active
          ? "bg-slate-900 text-white shadow-[0_16px_30px_rgba(15,23,42,0.14)]"
          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  )
}

type InventoryManagerProps = {
  onInventoryStarted?: () => void
}

export function InventoryManager({ onInventoryStarted }: InventoryManagerProps) {
  const [adminAccess, setAdminAccess] = useState<AdminAccess>({
    isAuthenticated: false,
    isAdmin: false,
    email: null,
  })
  const [todayInventory, setTodayInventory] = useState<InventarioDiario | null>(
    null,
  )
  const [todayMovements, setTodayMovements] = useState<InventarioMovimiento[]>([])
  const [stockAnterior, setStockAnterior] = useState(0)
  const [nuevosIngresos, setNuevosIngresos] = useState("")
  const [ingresosExtra, setIngresosExtra] = useState("")
  const [devolucionProveedor, setDevolucionProveedor] = useState("")
  const [mermaType, setMermaType] = useState<MermaType>("caidos")
  const [mermaPiece, setMermaPiece] = useState<InventoryPieceKey>("alas")
  const [mermaAmount, setMermaAmount] = useState("1")
  const [mermaReason, setMermaReason] = useState("")
  const [activeOperationTab, setActiveOperationTab] =
    useState<OperationTab>("proveedor")
  const [selectedPieceAdjustment, setSelectedPieceAdjustment] =
    useState<InventoryPieceKey>("alas")
  const [pieceStockValue, setPieceStockValue] = useState("0")
  const [pieceAdjustmentReason, setPieceAdjustmentReason] = useState("")
  const [conteoFisicoCierre, setConteoFisicoCierre] = useState("")
  const [notasCierre, setNotasCierre] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isStartingDay, setIsStartingDay] = useState(false)
  const [isSavingIngreso, setIsSavingIngreso] = useState(false)
  const [isSavingMerma, setIsSavingMerma] = useState(false)
  const [isSavingPieceAdjustment, setIsSavingPieceAdjustment] = useState(false)
  const [isClosingDay, setIsClosingDay] = useState(false)
  const [isReopeningDay, setIsReopeningDay] = useState(false)
  const [previousPieceStockSource, setPreviousPieceStockSource] =
    useState<PieceStockAllocation | null>(null)

  const loadAdminAccess = useCallback(async () => {
    try {
      const access = await getAdminAccess()
      setAdminAccess(access)
    } catch (error) {
      console.error("Error al validar acceso admin:", error)
      setAdminAccess({
        isAuthenticated: false,
        isAdmin: false,
        email: null,
      })
    }
  }, [])

  const loadTodayMovements = useCallback(async (inventoryId: string) => {
    const { data, error } = await supabase
      .from("inventario_movimientos")
      .select("*")
      .eq("inventario_id", inventoryId)
      .order("creado_en", { ascending: false })
      .limit(8)

    if (error) {
      throw error
    }

    setTodayMovements((data ?? []) as InventarioMovimiento[])
  }, [])

  async function createInventoryMovements(rows: InventarioMovimientoInsert[]) {
    if (rows.length === 0) {
      return
    }

    const { error } = await supabase.from("inventario_movimientos").insert(rows)

    if (error) {
      throw error
    }
  }

  async function syncInventoryMovements(inventoryId: string) {
    try {
      await loadTodayMovements(inventoryId)
    } catch (error) {
      console.error("Error al recargar movimientos:", error)
      toast.error("No se pudo actualizar la bitacora del dia")
    }
  }

  function getMovementActor() {
    return adminAccess.email ?? "operacion"
  }

  const loadTodayInventory = useCallback(async () => {
    const today = getTodayLocalISODate()

    try {
      setIsLoading(true)

      const { data: todayData, error: todayError } = await supabase
        .from("inventario_diario")
        .select("*")
        .eq("fecha", today)
        .maybeSingle()

      if (todayError) {
        throw todayError
      }

      if (todayData) {
        const inventory = todayData as InventarioDiario

        setTodayInventory(inventory)
        setPreviousPieceStockSource(
          hasPieceStockSource(inventory) ? getPieceStockAllocation(inventory) : null,
        )
        setStockAnterior(inventory.stock_anterior ?? 0)
        setConteoFisicoCierre(
          typeof inventory.conteo_fisico_cierre === "number"
            ? inventory.conteo_fisico_cierre.toString()
            : "",
        )
        setNotasCierre(inventory.notas_cierre ?? "")
        setSelectedPieceAdjustment("alas")
        setPieceStockValue(String(getAllocatedPieceStock(inventory, "alas")))
        setPieceAdjustmentReason("")
        await loadTodayMovements(inventory.id)
        return
      }

      const { data: previousData, error: previousError } = await supabase
        .from("inventario_diario")
        .select(
          "stock_final,stock_alas,stock_piernas,stock_muslos,stock_pechugas_g,stock_pechugas_c",
        )
        .lt("fecha", today)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (previousError) {
        throw previousError
      }

      setTodayInventory(null)
      setTodayMovements([])
      setStockAnterior(previousData?.stock_final ?? 0)
      if (
        previousData &&
        typeof previousData.stock_alas === "number" &&
        typeof previousData.stock_piernas === "number" &&
        typeof previousData.stock_muslos === "number" &&
        typeof previousData.stock_pechugas_g === "number" &&
        typeof previousData.stock_pechugas_c === "number"
      ) {
        setPreviousPieceStockSource({
          alas: previousData.stock_alas,
          piernas: previousData.stock_piernas,
          muslos: previousData.stock_muslos,
          pechugas_grandes: previousData.stock_pechugas_g,
          pechugas_chicas: previousData.stock_pechugas_c,
        })
      } else {
        setPreviousPieceStockSource(null)
      }
      setConteoFisicoCierre("")
      setNotasCierre("")
      setPieceAdjustmentReason("")
    } catch (error) {
      console.error("Error al cargar inventario diario:", error)
      toast.error("No se pudo cargar el inventario del dia")
    } finally {
      setIsLoading(false)
    }
  }, [loadTodayMovements])

  useEffect(() => {
    void loadTodayInventory()
    void loadAdminAccess()
  }, [loadAdminAccess, loadTodayInventory])

  useEffect(() => {
    if (!adminAccess.isAdmin && activeOperationTab === "ajustes") {
      setActiveOperationTab("proveedor")
    }
  }, [activeOperationTab, adminAccess.isAdmin])

  async function handleStartDay() {
    const nuevosIngresosValue = parseNonNegativeInteger(nuevosIngresos)

    if (nuevosIngresosValue == null) {
      toast.error("Ingresa una cantidad valida de piezas nuevas")
      return
    }

    try {
      setIsStartingDay(true)

      const stockBaseAllocation =
        previousPieceStockSource ?? allocateEvenPieces(stockAnterior)
      const newIngressAllocation = allocateEvenPieces(nuevosIngresosValue)
      const nextStockAllocation = {
        alas: stockBaseAllocation.alas + newIngressAllocation.alas,
        piernas: stockBaseAllocation.piernas + newIngressAllocation.piernas,
        muslos: stockBaseAllocation.muslos + newIngressAllocation.muslos,
        pechugas_grandes:
          stockBaseAllocation.pechugas_grandes + newIngressAllocation.pechugas_grandes,
        pechugas_chicas:
          stockBaseAllocation.pechugas_chicas + newIngressAllocation.pechugas_chicas,
      }

      const payload: InventarioDiarioInsert = {
        fecha: getTodayLocalISODate(),
        stock_anterior: stockAnterior,
        nuevos_ingresos: nuevosIngresosValue,
        pollos_vendidos: 0,
        ajustes_admin: 0,
        ajustes_alas: 0,
        ajustes_piernas: 0,
        ajustes_muslos: 0,
        ajustes_pechugas_g: 0,
        ajustes_pechugas_c: 0,
        ventas_alas: 0,
        ventas_piernas: 0,
        ventas_muslos: 0,
        ventas_pechugas_g: 0,
        ventas_pechugas_c: 0,
        mermas_caidos: 0,
        mermas_quemados: 0,
        mermas_alas: 0,
        mermas_piernas: 0,
        mermas_muslos: 0,
        mermas_pechugas_g: 0,
        mermas_pechugas_c: 0,
        conteo_fisico_cierre: null,
        diferencia_cierre: null,
        notas_cierre: null,
        cerrado_en: null,
        ...getStockSourcePayloadFromAllocation(nextStockAllocation),
      }

      const { data, error } = await supabase
        .from("inventario_diario")
        .insert(payload)
        .select()
        .single()

      if (error) {
        throw error
      }

      const inventory = data as InventarioDiario
      setTodayInventory(inventory)
      setPreviousPieceStockSource(
        hasPieceStockSource(inventory) ? getPieceStockAllocation(inventory) : null,
      )
      setTodayMovements([])
      setNuevosIngresos("")
      setConteoFisicoCierre("")
      setNotasCierre("")
      setSelectedPieceAdjustment("alas")
      setPieceStockValue(String(getAllocatedPieceStock(inventory, "alas")))
      setPieceAdjustmentReason("")
      onInventoryStarted?.()
      toast.success("Inventario del dia iniciado correctamente")
    } catch (error) {
      console.error("Error al iniciar el dia:", error)
      toast.error(getErrorMessage(error))
    } finally {
      setIsStartingDay(false)
    }
  }

  async function handleRegisterIngreso() {
    if (!todayInventory || todayInventory.cerrado_en) {
      return
    }

    const ingresosValue = parseNonNegativeInteger(ingresosExtra || "0")
    const devolucionValue = parseNonNegativeInteger(devolucionProveedor || "0")

    if (ingresosValue == null || devolucionValue == null) {
      toast.error("Ingresa cantidades validas para el movimiento")
      return
    }

    if (ingresosValue === 0 && devolucionValue === 0) {
      toast.error("Captura un ingreso o una devolucion al proveedor")
      return
    }

    const nextNuevosIngresos =
      todayInventory.nuevos_ingresos + ingresosValue - devolucionValue

    if (nextNuevosIngresos < 0) {
      toast.error("La devolucion no puede dejar los ingresos del dia en negativo")
      return
    }

    try {
      setIsSavingIngreso(true)

      const stockSourceDelta = getStockSourceDeltaPayload(ingresosValue - devolucionValue)
      const nextStockByPiece = {
        alas: (todayInventory.stock_alas ?? 0) + stockSourceDelta.stock_alas,
        piernas: (todayInventory.stock_piernas ?? 0) + stockSourceDelta.stock_piernas,
        muslos: (todayInventory.stock_muslos ?? 0) + stockSourceDelta.stock_muslos,
        pechugas_grandes:
          (todayInventory.stock_pechugas_g ?? 0) + stockSourceDelta.stock_pechugas_g,
        pechugas_chicas:
          (todayInventory.stock_pechugas_c ?? 0) + stockSourceDelta.stock_pechugas_c,
      }

      if (Object.values(nextStockByPiece).some((value) => value < 0)) {
        toast.error("La devolucion excede el stock actual por pieza")
        return
      }

      const { data, error } = await supabase
        .from("inventario_diario")
        .update({
          nuevos_ingresos: nextNuevosIngresos,
          stock_alas: nextStockByPiece.alas,
          stock_piernas: nextStockByPiece.piernas,
          stock_muslos: nextStockByPiece.muslos,
          stock_pechugas_g: nextStockByPiece.pechugas_grandes,
          stock_pechugas_c: nextStockByPiece.pechugas_chicas,
        })
        .eq("id", todayInventory.id)
        .select()
        .single()

      if (error) {
        throw error
      }

      const movements: InventarioMovimientoInsert[] = []
      const actor = getMovementActor()

      if (ingresosValue > 0) {
        movements.push({
          inventario_id: todayInventory.id,
          fecha: todayInventory.fecha,
          tipo_movimiento: "entrada_proveedor",
          cantidad_equivalente: ingresosValue,
          cantidad_piezas: ingresosValue,
          motivo: "Ingreso adicional del proveedor",
          registrado_por: actor,
        })
      }

      if (devolucionValue > 0) {
        movements.push({
          inventario_id: todayInventory.id,
          fecha: todayInventory.fecha,
          tipo_movimiento: "devolucion_proveedor",
          cantidad_equivalente: -devolucionValue,
          cantidad_piezas: -devolucionValue,
          motivo: "Producto devuelto a cambio al proveedor",
          registrado_por: actor,
        })
      }

      await createInventoryMovements(movements)

      const inventory = data as InventarioDiario
      setTodayInventory(inventory)
      setIngresosExtra("")
      setDevolucionProveedor("")
      await syncInventoryMovements(todayInventory.id)

      if (ingresosValue > 0 && devolucionValue > 0) {
        toast.success("Ingreso y devolucion del proveedor registrados")
      } else if (ingresosValue > 0) {
        toast.success("Ingreso adicional registrado")
      } else {
        toast.success("Devolucion al proveedor registrada")
      }

      void registrarEventoAuditoriaBestEffort({
        modulo: "inventario",
        accion: "movimiento_proveedor_registrado",
        entidad: "inventario_diario",
        entidadId: inventory.id,
        detalle: {
          fecha: inventory.fecha,
          ingreso_piezas: ingresosValue,
          devolucion_piezas: devolucionValue,
          nuevos_ingresos_total: inventory.nuevos_ingresos,
        },
      })
    } catch (error) {
      console.error("Error al registrar el movimiento de ingreso:", error)
      toast.error("No se pudo guardar el movimiento del proveedor")
    } finally {
      setIsSavingIngreso(false)
    }
  }

  async function handleRegisterMerma() {
    if (!todayInventory || todayInventory.cerrado_en) {
      return
    }

    if (!mermaReason.trim()) {
      toast.error("Describe el motivo de la merma antes de guardarla")
      return
    }

    const mermaValue = parseNonNegativeInteger(mermaAmount)

    if (mermaValue == null || mermaValue === 0) {
      toast.error("Ingresa una cantidad valida para la merma")
      return
    }

    const generalField =
      mermaType === "quemados" ? "mermas_quemados" : "mermas_caidos"
    const pieceField = MERMA_FIELD_MAP[mermaPiece]
    const stockField = PIECE_STOCK_FIELD_MAP[mermaPiece]

    const payload: InventarioDiarioUpdate = {
      [generalField]: (todayInventory[generalField] ?? 0) + mermaValue,
      [pieceField]: (todayInventory[pieceField] ?? 0) + mermaValue,
      [stockField]: Math.max(0, (todayInventory[stockField] ?? 0) - mermaValue),
    }

    try {
      setIsSavingMerma(true)

      const { data, error } = await supabase
        .from("inventario_diario")
        .update(payload)
        .eq("id", todayInventory.id)
        .select()
        .single()

      if (error) {
        throw error
      }

      await createInventoryMovements([
        {
          inventario_id: todayInventory.id,
          fecha: todayInventory.fecha,
          tipo_movimiento: "merma",
          subtipo: mermaType,
          pieza: mermaPiece,
          cantidad_equivalente: -mermaValue,
          cantidad_piezas: -mermaValue,
          motivo: mermaReason.trim(),
          registrado_por: getMovementActor(),
        },
      ])

      const inventory = data as InventarioDiario
      setTodayInventory(inventory)
      if (selectedPieceAdjustment === mermaPiece) {
        setPieceStockValue(String(getAllocatedPieceStock(inventory, mermaPiece)))
      }
      setMermaAmount("1")
      setMermaReason("")
      await syncInventoryMovements(todayInventory.id)
      toast.success("Merma registrada correctamente")

      void registrarEventoAuditoriaBestEffort({
        modulo: "inventario",
        accion: "merma_registrada",
        entidad: "inventario_diario",
        entidadId: inventory.id,
        detalle: {
          fecha: inventory.fecha,
          tipo: mermaType,
          pieza: mermaPiece,
          cantidad_piezas: mermaValue,
          motivo: mermaReason.trim(),
        },
      })
    } catch (error) {
      console.error("Error al registrar la merma:", error)
      toast.error("No se pudo registrar la merma")
    } finally {
      setIsSavingMerma(false)
    }
  }

  function openPieceAdjustment(pieceKey: InventoryPieceKey) {
    if (!todayInventory) {
      return
    }

    if (!adminAccess.isAdmin) {
      toast.error("Solo un administrador puede ajustar stock por pieza")
      return
    }

    setSelectedPieceAdjustment(pieceKey)
    setPieceStockValue(String(getAllocatedPieceStock(todayInventory, pieceKey)))
    setPieceAdjustmentReason("")
    setActiveOperationTab("ajustes")
  }

  async function handleSavePieceAdjustment() {
    if (!todayInventory || todayInventory.cerrado_en) {
      return
    }

    if (!adminAccess.isAdmin) {
      toast.error("Solo un administrador puede ajustar stock por pieza")
      return
    }

    if (!pieceAdjustmentReason.trim()) {
      toast.error("Agrega un motivo para el ajuste de stock")
      return
    }

    const targetStockValue = parseNonNegativeInteger(pieceStockValue)

    if (targetStockValue == null) {
      toast.error("Ingresa un stock objetivo valido")
      return
    }

    const currentStock = getAllocatedPieceStock(todayInventory, selectedPieceAdjustment)
    const deltaPieces = targetStockValue - currentStock

    if (deltaPieces === 0) {
      toast.error("El stock ya coincide con el valor capturado")
      return
    }

    const ajusteField = AJUSTE_FIELD_MAP[selectedPieceAdjustment]
    const stockField = PIECE_STOCK_FIELD_MAP[selectedPieceAdjustment]
    const nextPieceAdjustment = Math.round(todayInventory[ajusteField] ?? 0) + deltaPieces
    const nextAdminAdjustment = Math.round(todayInventory.ajustes_admin ?? 0) + deltaPieces

    const payload: InventarioDiarioUpdate = {
      [ajusteField]: nextPieceAdjustment,
      ajustes_admin: nextAdminAdjustment,
      [stockField]: targetStockValue,
    }

    try {
      setIsSavingPieceAdjustment(true)

      const { data, error } = await supabase
        .from("inventario_diario")
        .update(payload)
        .eq("id", todayInventory.id)
        .select()
        .single()

      if (error) {
        throw error
      }

      await createInventoryMovements([
        {
          inventario_id: todayInventory.id,
          fecha: todayInventory.fecha,
          tipo_movimiento: "ajuste_admin",
          subtipo: "stock_por_pieza",
          pieza: selectedPieceAdjustment,
          cantidad_equivalente: deltaPieces,
          cantidad_piezas: deltaPieces,
          motivo: pieceAdjustmentReason.trim(),
          registrado_por: getMovementActor(),
        },
      ])

      const inventory = data as InventarioDiario
      setTodayInventory(inventory)
      setPieceStockValue(
        String(getAllocatedPieceStock(inventory, selectedPieceAdjustment)),
      )
      setPieceAdjustmentReason("")
      await syncInventoryMovements(todayInventory.id)
      toast.success("Stock ajustado para " + PIECE_LABELS[selectedPieceAdjustment])

      void registrarEventoAuditoriaBestEffort({
        modulo: "inventario",
        accion: "ajuste_admin_stock_pieza",
        entidad: "inventario_diario",
        entidadId: inventory.id,
        detalle: {
          fecha: inventory.fecha,
          pieza: selectedPieceAdjustment,
          stock_anterior: currentStock,
          stock_objetivo: targetStockValue,
          delta_piezas: deltaPieces,
          motivo: pieceAdjustmentReason.trim(),
        },
      })
    } catch (error) {
      console.error("Error al guardar ajuste por pieza:", error)
      toast.error("No se pudo guardar el ajuste por pieza")
    } finally {
      setIsSavingPieceAdjustment(false)
    }
  }

  async function handleReopenDay() {
    if (!todayInventory || !todayInventory.cerrado_en) {
      return
    }

    if (!adminAccess.isAuthenticated) {
      toast.error("Debes iniciar sesion como administrador para reabrir el dia")
      return
    }

    if (!adminAccess.isAdmin) {
      toast.error("Tu usuario no tiene permisos de administrador")
      return
    }

    try {
      setIsReopeningDay(true)

      const { data, error } = await (supabase as typeof supabase & {
        rpc: (
          fn: "reabrir_inventario_dia",
          args: { p_inventory_id: string },
        ) => Promise<{
          data: InventarioDiario | null
          error: Error | null
        }>
      }).rpc("reabrir_inventario_dia", {
        p_inventory_id: todayInventory.id,
      })

      if (error) {
        throw error
      }

      const inventory = data as InventarioDiario
      setTodayInventory(inventory)
      setConteoFisicoCierre("")
      setNotasCierre("")
      setPieceStockValue(
        String(getAllocatedPieceStock(inventory, selectedPieceAdjustment)),
      )
      setPieceAdjustmentReason("")
      await createInventoryMovements([
        {
          inventario_id: inventory.id,
          fecha: inventory.fecha,
          tipo_movimiento: "reapertura_admin",
          cantidad_equivalente: 0,
          cantidad_piezas: 0,
          motivo: "Dia reabierto por administrador",
          registrado_por: getMovementActor(),
        },
      ])
      await syncInventoryMovements(inventory.id)
      toast.success("Dia reabierto en modo administrador")

      void registrarEventoAuditoriaBestEffort({
        modulo: "inventario",
        accion: "reapertura_dia",
        entidad: "inventario_diario",
        entidadId: inventory.id,
        detalle: {
          fecha: inventory.fecha,
        },
      })
    } catch (error) {
      console.error("Error al reabrir el dia:", error)
      toast.error("No se pudo reabrir el dia")
    } finally {
      setIsReopeningDay(false)
    }
  }

  async function handleCloseDay() {
    if (!todayInventory || todayInventory.cerrado_en) {
      return
    }

    const conteoValue = parseNonNegativeInteger(conteoFisicoCierre)

    if (conteoValue == null) {
      toast.error("Ingresa un conteo fisico valido")
      return
    }

    const stockEstimado = getStockFinalPieces(todayInventory)
    const diferencia = conteoValue - stockEstimado

    const payload: InventarioDiarioUpdate = {
      conteo_fisico_cierre: conteoValue,
      diferencia_cierre: diferencia,
      notas_cierre: notasCierre.trim() || null,
      cerrado_en: new Date().toISOString(),
    }

    try {
      setIsClosingDay(true)

      const { data, error } = await supabase
        .from("inventario_diario")
        .update(payload)
        .eq("id", todayInventory.id)
        .select()
        .single()

      if (error) {
        throw error
      }

      const inventory = data as InventarioDiario
      setTodayInventory(inventory)
      await createInventoryMovements([
        {
          inventario_id: inventory.id,
          fecha: inventory.fecha,
          tipo_movimiento: "cierre_turno",
          cantidad_equivalente: 0,
          cantidad_piezas: 0,
          motivo: notasCierre.trim() || "Cierre de turno registrado",
          registrado_por: getMovementActor(),
        },
      ])
      await syncInventoryMovements(inventory.id)

      if (diferencia === 0) {
        toast.success("Cierre de turno conciliado sin diferencias")
      } else if (diferencia > 0) {
        toast.success("Cierre de turno guardado con sobrante registrado")
      } else {
        toast.success("Cierre de turno guardado con faltante registrado")
      }

      void registrarEventoAuditoriaBestEffort({
        modulo: "inventario",
        accion: "cierre_dia",
        entidad: "inventario_diario",
        entidadId: inventory.id,
        detalle: {
          fecha: inventory.fecha,
          conteo_fisico: conteoValue,
          stock_estimado: stockEstimado,
          diferencia,
          notas_cierre: notasCierre.trim() || null,
        },
      })
    } catch (error) {
      console.error("Error al cerrar el dia:", error)
      toast.error("No se pudo guardar el cierre de turno")
    } finally {
      setIsClosingDay(false)
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-[2rem] bg-white p-4 sm:p-5 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm font-medium text-slate-500">
          Cargando inventario del dia...
        </div>
      </section>
    )
  }

  if (!todayInventory) {
    return (
      <section className="rounded-[2rem] bg-white p-4 sm:p-5 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-slate-50 p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Inventario diario
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Inicia inventario para habilitar ventas
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            El sistema requiere inventario diario antes de cobrar en caja. Registra aqui las piezas de hoy para
            habilitar las ventas y mantener el control correcto del turno.
          </p>
          <p className="mt-5 text-2xl font-black text-amber-600 sm:text-3xl">
            Stock sobrante de ayer: {formatMetric(stockAnterior)} pzs
          </p>
          <div className="mt-6">
            <label
              htmlFor="nuevos-ingresos"
              className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
            >
              Cuantas piezas nuevas llegaron hoy?
            </label>
            <input
              id="nuevos-ingresos"
              type="number"
              min="0"
              step="1"
              value={nuevosIngresos}
              onChange={(event) => setNuevosIngresos(event.target.value)}
              className="mt-3 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-xl font-black text-slate-900 outline-none transition focus:border-slate-400 sm:py-5 sm:text-2xl"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleStartDay()}
            disabled={isStartingDay}
            className="mt-5 w-full rounded-3xl bg-slate-900 px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none sm:py-5 sm:text-lg"
          >
            {isStartingDay ? "Guardando inventario..." : "Guardar inventario de hoy"}
          </button>
        </div>
      </section>
    )
  }

  const stockDisponible = getStockFinalPieces(todayInventory)
  const pieceStockAllocation = getPieceStockAllocation(todayInventory)
  const conciliacion = todayInventory.diferencia_cierre
  const isClosed = Boolean(todayInventory.cerrado_en)
  const canUseAdminAdjustments = adminAccess.isAdmin
  const selectedPieceStock = pieceStockAllocation[selectedPieceAdjustment]
  const selectedPieceVentas =
    todayInventory[PIECE_FIELD_MAP[selectedPieceAdjustment]] ?? 0
  const selectedPieceMermas =
    todayInventory[MERMA_FIELD_MAP[selectedPieceAdjustment]] ?? 0
  const selectedPieceAjustes =
    todayInventory[AJUSTE_FIELD_MAP[selectedPieceAdjustment]] ?? 0

  return (
    <section className="rounded-[2rem] bg-white p-4 sm:p-5 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Inventario diario
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Control de inventario
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="font-bold text-slate-900">
              {adminAccess.isAdmin
                ? "Admin verificado"
                : adminAccess.isAuthenticated
                  ? "Usuario sin permisos admin"
                  : "Admin requiere sesion"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {adminAccess.email ?? "No hay sesion iniciada"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadTodayInventory()}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100"
          >
            Recargar
          </button>
        </div>
      </div>

      {isClosed ? (
        <div className="mt-6 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Dia cerrado
          </p>
          <h3 className="mt-2 text-2xl font-black text-emerald-950">
            Cierre de turno registrado correctamente
          </h3>
          <p className="mt-2 text-sm text-emerald-800">
            Cerrado el {formatInventoryDateTime(todayInventory.cerrado_en)}. Ya no deberias registrar movimientos operativos hasta reabrir el dia.
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <article className="col-span-2 rounded-3xl border border-slate-200 bg-slate-900 p-4 text-white shadow-[0_24px_60px_rgba(15,23,42,0.12)] sm:p-5 xl:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Stock Disponible
          </p>
          <p className="mt-2 text-3xl font-black text-white sm:text-4xl lg:text-5xl">
            {formatMetric(stockDisponible)}
          </p>
          <p className="mt-3 text-sm text-slate-300">
            Inicio del dia: {formatMetric(getTotalEnParrilla(todayInventory))} pzs
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Ajustes admin: {formatSignedMetric(getInventoryAdminAdjustmentPieces(todayInventory))}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Vendidos
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-600 sm:text-3xl">
            {formatMetric(getInventorySoldPieces(todayInventory))}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Mermas
          </p>
          <p className="mt-2 text-2xl font-black text-rose-600 sm:text-3xl">
            {formatMetric(getInventoryMermaPieces(todayInventory))}
          </p>
        </article>

        <article className="col-span-2 rounded-3xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm sm:p-4 xl:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Conciliacion
          </p>
          <p
            className={`mt-2 text-2xl font-black sm:text-3xl ${
              conciliacion == null
                ? "text-slate-500"
                : conciliacion === 0
                  ? "text-emerald-600"
                  : conciliacion > 0
                    ? "text-amber-600"
                    : "text-rose-600"
            }`}
          >
            {conciliacion == null ? "Pend." : formatSignedMetric(conciliacion)}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {conciliacion == null
              ? "Aun no se ha cerrado el dia"
              : conciliacion === 0
                ? "Conteo fisico alineado"
                : conciliacion > 0
                  ? "Sobrante sobre el estimado"
                  : "Faltante contra el estimado"}
          </p>
        </article>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[2rem] bg-slate-50 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Operacion del dia
            </p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              Movimientos del dia
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Proveedor y mermas para operacion diaria. El ajuste fino de stock queda reservado para admin.
            </p>
          </div>
          <div className="mt-1 flex w-full flex-wrap gap-2 lg:mt-0 lg:w-auto lg:justify-end">
            <OperationTabButton
              active={activeOperationTab === "proveedor"}
              label="Proveedor"
              onClick={() => setActiveOperationTab("proveedor")}
            />
            <OperationTabButton
              active={activeOperationTab === "mermas"}
              label="Mermas"
              onClick={() => setActiveOperationTab("mermas")}
            />
            {canUseAdminAdjustments ? (
              <OperationTabButton
                active={activeOperationTab === "ajustes"}
                label="Stock por pieza"
                onClick={() => setActiveOperationTab("ajustes")}
              />
            ) : null}
          </div>
        </div>

        {isClosed ? (
          <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
            El dia esta cerrado. Reabre en modo administrador si necesitas registrar ingresos, mermas o correcciones por pieza.
          </div>
        ) : null}

        {activeOperationTab === "proveedor" ? (
          <section className="mt-4 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-base font-black text-slate-900">
              Movimiento de proveedor
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              Usa esta vista si llegan piezas despues de abrir caja o si una parte se devuelve a cambio.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="ingresos-extra" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Piezas nuevas recibidas
                </label>
                <input
                  id="ingresos-extra"
                  type="number"
                  min="0"
                  step="1"
                  value={ingresosExtra}
                  onChange={(event) => setIngresosExtra(event.target.value)}
                  disabled={isClosed}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-lg font-black text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div>
                <label htmlFor="devolucion-proveedor" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Devuelto a cambio
                </label>
                <input
                  id="devolucion-proveedor"
                  type="number"
                  min="0"
                  step="1"
                  value={devolucionProveedor}
                  onChange={(event) => setDevolucionProveedor(event.target.value)}
                  disabled={isClosed}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-lg font-black text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>

            <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-bold text-slate-900">Devuelto a cambio</span>{" "}
              descuenta piezas del ingreso acumulado del dia.
            </div>

            <button
              type="button"
              onClick={() => void handleRegisterIngreso()}
              disabled={isSavingIngreso || isClosed}
              className="mt-4 rounded-3xl bg-slate-900 px-5 py-3.5 text-sm font-black text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            >
              {isSavingIngreso ? "Guardando movimiento..." : "Registrar Movimiento"}
            </button>
          </section>
        ) : null}

        {activeOperationTab === "mermas" ? (
          <section className="mt-4 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-base font-black text-slate-900">Merma manual</h4>
            <p className="mt-1 text-sm text-slate-500">
              Registra piezas caidas, golpeadas o quemadas. El motivo es obligatorio para dejar claro por que se descuenta.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div>
                <label htmlFor="merma-type" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Tipo de merma
                </label>
                <select
                  id="merma-type"
                  value={mermaType}
                  onChange={(event) => setMermaType(event.target.value as MermaType)}
                  disabled={isClosed}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="caidos">Caidos / golpeados</option>
                  <option value="quemados">Quemados</option>
                </select>
              </div>

              <div>
                <label htmlFor="merma-piece" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Pieza afectada
                </label>
                <select
                  id="merma-piece"
                  value={mermaPiece}
                  onChange={(event) => setMermaPiece(event.target.value as InventoryPieceKey)}
                  disabled={isClosed}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {(Object.keys(PIECE_LABELS) as InventoryPieceKey[]).map((pieceKey) => (
                    <option key={pieceKey} value={pieceKey}>
                      {PIECE_LABELS[pieceKey]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="merma-amount" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Cantidad
                </label>
                <input
                  id="merma-amount"
                  type="number"
                  min="1"
                  value={mermaAmount}
                  onChange={(event) => setMermaAmount(event.target.value)}
                  disabled={isClosed}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>

            <div className="mt-3">
              <label
                htmlFor="merma-reason"
                className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
              >
                Motivo de la merma
              </label>
              <textarea
                id="merma-reason"
                rows={3}
                value={mermaReason}
                onChange={(event) => setMermaReason(event.target.value)}
                disabled={isClosed}
                placeholder="Ej. Pechuga golpeada al bajar de la parrilla / Ala quemada / Cliente rechazo pieza"
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleRegisterMerma()}
              disabled={isSavingMerma || isClosed}
              className="mt-4 rounded-3xl bg-slate-900 px-5 py-3.5 text-sm font-black text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            >
              {isSavingMerma ? "Guardando..." : "Registrar Merma"}
            </button>
          </section>
        ) : null}

        {activeOperationTab === "ajustes" && canUseAdminAdjustments ? (
          <section className="mt-4 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="text-base font-black text-slate-900">
                  Ajuste admin por pieza
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                  Corrige el stock fisico de una pieza con una correccion administrativa separada de ventas y mermas reales.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Pieza seleccionada:{" "}
                <span className="font-black text-slate-900">
                  {PIECE_LABELS[selectedPieceAdjustment]}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-3xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Stock actual
                </p>
                <p className="mt-3 text-3xl font-black text-slate-900">
                  {selectedPieceStock}
                </p>
              </article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Ventas registradas
                </p>
                <p className="mt-3 text-3xl font-black text-emerald-600">
                  {selectedPieceVentas}
                </p>
              </article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Mermas registradas
                </p>
                <p className="mt-3 text-3xl font-black text-rose-600">
                  {selectedPieceMermas}
                </p>
              </article>
              <article className="rounded-3xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Ajuste admin
                </p>
                <p className="mt-3 text-3xl font-black text-sky-600">
                  {formatSignedMetric(selectedPieceAjustes)}
                </p>
              </article>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div>
                <label htmlFor="piece-stock" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Stock fisico corregido
                </label>
                <input
                  id="piece-stock"
                  type="number"
                  min="0"
                  step="1"
                  value={pieceStockValue}
                  onChange={(event) => setPieceStockValue(event.target.value)}
                  disabled={isClosed}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-lg font-black text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div>
                <label htmlFor="piece-adjustment-reason" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Motivo del ajuste
                </label>
                <textarea
                  id="piece-adjustment-reason"
                  rows={3}
                  value={pieceAdjustmentReason}
                  onChange={(event) => setPieceAdjustmentReason(event.target.value)}
                  disabled={isClosed}
                  placeholder="Ej. Conteo fisico real distinto al estimado / Ajuste validado por admin"
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>

            <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Este ajuste suma o resta correccion administrativa; no cambia ventas ni merma real.
            </div>

            <button
              type="button"
              onClick={() => void handleSavePieceAdjustment()}
              disabled={isSavingPieceAdjustment || isClosed}
              className="mt-4 rounded-3xl bg-slate-900 px-5 py-3.5 text-sm font-black text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            >
              {isSavingPieceAdjustment ? "Guardando ajuste..." : "Guardar ajuste de stock"}
            </button>
          </section>
        ) : null}

          <section className="mt-4 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-black text-slate-900">Bitacora del dia</h4>
                <p className="mt-1 text-sm text-slate-500">
                  Ultimos movimientos auditables del inventario.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                {todayMovements.length}
              </span>
            </div>

            {todayMovements.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Aun no hay movimientos registrados para hoy.
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {todayMovements.map((movement) => (
                  <article
                    key={movement.id}
                    className="rounded-3xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">
                          {getMovementTitle(movement)}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                          {formatInventoryDateTime(movement.creado_en)}
                        </p>
                      </div>
                      <p className={"text-sm font-black " + getMovementTone(movement)}>
                        {getMovementQuantityLabel(movement)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      {movement.pieza ? (
                        <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
                          {PIECE_LABELS[movement.pieza as InventoryPieceKey] ?? movement.pieza}
                        </span>
                      ) : null}
                      {movement.subtipo ? (
                        <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
                          {movement.subtipo.replace(/_/g, " ")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {movement.motivo?.trim() || "Sin detalle adicional."}
                    </p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Registrado por {movement.registrado_por ?? "operacion"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="rounded-[2rem] bg-slate-50 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Inventario por pieza
            </p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              Stock por pieza
            </h3>
          </div>
          <p className="text-sm text-slate-500">Fuente principal: stock_* por pieza (entero).</p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PIECE_KEYS.map((pieceKey) => {
            const stock = pieceStockAllocation[pieceKey]
            const ventas = todayInventory[PIECE_FIELD_MAP[pieceKey]] ?? 0
            const mermas = todayInventory[MERMA_FIELD_MAP[pieceKey]] ?? 0
            const ajustes = todayInventory[AJUSTE_FIELD_MAP[pieceKey]] ?? 0
            const isLowStock = stock < 5
            const isSelected = canUseAdminAdjustments && selectedPieceAdjustment === pieceKey

            return (
              <article
                key={pieceKey}
                className={`rounded-3xl border bg-white p-3.5 shadow-sm transition ${
                  isSelected ? "border-slate-900 ring-2 ring-slate-200" : "border-slate-200"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {PIECE_LABELS[pieceKey]}
                    </p>
                    <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
                      {formatMetric(stock)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                    {isLowStock ? (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-rose-600">
                        Bajo Stock
                      </span>
                    ) : null}
                    {canUseAdminAdjustments ? (
                      <button
                        type="button"
                        onClick={() => openPieceAdjustment(pieceKey)}
                        aria-label={`Ajustar ${PIECE_LABELS[pieceKey]}`}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition focus:outline-none focus:ring-4 focus:ring-slate-100 ${
                          isSelected
                            ? "bg-slate-900 text-white"
                            : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          className="h-3.5 w-3.5 fill-current"
                        >
                          <path d="M14.7 2.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4l-8.9 8.9-3.5.8.8-3.5 8.8-9.2Z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2.5 space-y-1 text-[11px] text-slate-500 sm:text-xs">
                  <p>Ventas: {ventas}</p>
                  <p>Mermas: {mermas}</p>
                  <p>Ajustes: {formatSignedMetric(ajustes)}</p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] bg-slate-50 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Cierre de turno
          </p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            Conciliacion final del dia
          </h3>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <article className="rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Stock estimado
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {formatMetric(stockDisponible)}
              </p>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Conteo fisico
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {todayInventory.conteo_fisico_cierre == null
                  ? "Pend."
                  : formatMetric(todayInventory.conteo_fisico_cierre)}
              </p>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Diferencia
              </p>
              <p
                className={`mt-2 text-2xl font-black ${
                  conciliacion == null
                    ? "text-slate-500"
                    : conciliacion === 0
                      ? "text-emerald-600"
                      : conciliacion > 0
                        ? "text-amber-600"
                        : "text-rose-600"
                }`}
              >
                {conciliacion == null ? "Pend." : formatSignedMetric(conciliacion)}
              </p>
            </article>
          </div>

          {isClosed ? (
            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-700">
                Cierre registrado: {formatInventoryDateTime(todayInventory.cerrado_en)}
              </p>
              <p className="mt-3 text-sm text-slate-600">
                {todayInventory.notas_cierre?.trim() || "Sin notas de cierre."}
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4">
                <label htmlFor="conteo-fisico-cierre" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Conteo fisico real al cierre
                </label>
                <input
                  id="conteo-fisico-cierre"
                  type="number"
                  min="0"
                  step="1"
                  value={conteoFisicoCierre}
                  onChange={(event) => setConteoFisicoCierre(event.target.value)}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-xl font-black text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              <div className="mt-3">
                <label htmlFor="notas-cierre" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Notas del cierre
                </label>
                <textarea
                  id="notas-cierre"
                  rows={4}
                  value={notasCierre}
                  onChange={(event) => setNotasCierre(event.target.value)}
                  placeholder="Ej. Sobraron 8 piezas en parrilla y una pechuga en preparacion"
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleCloseDay()}
                disabled={isClosingDay}
                className="mt-4 w-full rounded-3xl bg-slate-900 px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                {isClosingDay ? "Guardando cierre..." : "Cerrar Dia"}
              </button>
            </>
          )}
        </section>

        <section className="rounded-[2rem] bg-slate-50 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Herramientas admin
          </p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            Reapertura y control operativo
          </h3>

          {!adminAccess.isAdmin ? (
            <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
              Inicia sesion con un usuario administrador autorizado en Supabase para reabrir un dia cerrado y continuar con correcciones posteriores.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-800">
                  Estado actual: {isClosed ? "Dia cerrado" : "Dia abierto"}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Admin actual: {adminAccess.email ?? "Sin correo disponible"}. Reabre solo cuando necesites corregir conteos o movimientos posteriores al cierre.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleReopenDay()}
                disabled={!isClosed || isReopeningDay}
                className="w-full rounded-3xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-black text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {isReopeningDay ? "Reabriendo dia..." : "Reabrir Dia"}
              </button>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

export default InventoryManager
