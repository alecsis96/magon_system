import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import {
  PIECE_LABELS,
  type InventoryPieceKey,
} from "../constants/inventory"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import { supabase } from "../lib/supabase"
import type {
  InventarioDiario,
  InventarioDiarioInsert,
  InventarioDiarioUpdate,
} from "../types/database"

type MermaType = "caidos" | "quemados"
type OperationTab = "proveedor" | "mermas" | "ajustes"

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

function getTodayLocalISODate() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)

  return localDate.toISOString().slice(0, 10)
}

function getTotalEnParrilla(inventario: InventarioDiario) {
  return (inventario.stock_anterior ?? 0) + (inventario.nuevos_ingresos ?? 0)
}

function getInventorySoldEquivalent(inventario: InventarioDiario) {
  if (typeof inventario.pollos_vendidos === "number") {
    return inventario.pollos_vendidos
  }

  const soldPieces =
    (inventario.ventas_alas ?? 0) +
    (inventario.ventas_piernas ?? 0) +
    (inventario.ventas_muslos ?? 0) +
    (inventario.ventas_pechugas_g ?? 0) +
    (inventario.ventas_pechugas_c ?? 0)

  return soldPieces / 10
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

function getStockFinalEquivalent(inventario: InventarioDiario) {
  if (typeof inventario.stock_final === "number") {
    return inventario.stock_final
  }

  const totalPieces = getTotalEnParrilla(inventario) * 10
  const soldPieces = getInventorySoldEquivalent(inventario) * 10
  const mermaPieces = getInventoryMermaPieces(inventario)

  return (totalPieces - soldPieces - mermaPieces) / 10
}

function formatMetric(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
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

function formatDateTime(value: string | null) {
  if (!value) {
    return ""
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getPieceStock(inventario: InventarioDiario, pieceKey: InventoryPieceKey) {
  const totalPollos = getTotalEnParrilla(inventario)
  const ventasField = PIECE_FIELD_MAP[pieceKey]
  const mermasField = MERMA_FIELD_MAP[pieceKey]
  const ventas = inventario[ventasField] ?? 0
  const mermas = inventario[mermasField] ?? 0

  return totalPollos * 2 - ventas - mermas
}

function parseNonNegativeNumber(value: string) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
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
      className={`rounded-2xl px-4 py-2.5 text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-slate-200 ${
        active
          ? "bg-slate-900 text-white shadow-[0_16px_30px_rgba(15,23,42,0.14)]"
          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  )
}

export function InventoryManager() {
  const [adminAccess, setAdminAccess] = useState<AdminAccess>({
    isAuthenticated: false,
    isAdmin: false,
    email: null,
  })
  const [todayInventory, setTodayInventory] = useState<InventarioDiario | null>(
    null,
  )
  const [stockAnterior, setStockAnterior] = useState(0)
  const [nuevosIngresos, setNuevosIngresos] = useState("")
  const [ingresosExtra, setIngresosExtra] = useState("")
  const [devolucionProveedor, setDevolucionProveedor] = useState("")
  const [mermaType, setMermaType] = useState<MermaType>("caidos")
  const [mermaPiece, setMermaPiece] = useState<InventoryPieceKey>("alas")
  const [mermaAmount, setMermaAmount] = useState("1")
  const [activeOperationTab, setActiveOperationTab] =
    useState<OperationTab>("proveedor")
  const [selectedPieceAdjustment, setSelectedPieceAdjustment] =
    useState<InventoryPieceKey>("alas")
  const [pieceVentasValue, setPieceVentasValue] = useState("0")
  const [pieceMermasValue, setPieceMermasValue] = useState("0")
  const [conteoFisicoCierre, setConteoFisicoCierre] = useState("")
  const [notasCierre, setNotasCierre] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isStartingDay, setIsStartingDay] = useState(false)
  const [isSavingIngreso, setIsSavingIngreso] = useState(false)
  const [isSavingMerma, setIsSavingMerma] = useState(false)
  const [isSavingPieceAdjustment, setIsSavingPieceAdjustment] = useState(false)
  const [isClosingDay, setIsClosingDay] = useState(false)
  const [isReopeningDay, setIsReopeningDay] = useState(false)

  async function loadAdminAccess() {
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
  }

  async function loadTodayInventory() {
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
        setStockAnterior(inventory.stock_anterior ?? 0)
        setConteoFisicoCierre(
          typeof inventory.conteo_fisico_cierre === "number"
            ? inventory.conteo_fisico_cierre.toString()
            : "",
        )
        setNotasCierre(inventory.notas_cierre ?? "")
        setSelectedPieceAdjustment("alas")
        setPieceVentasValue(String(inventory.ventas_alas ?? 0))
        setPieceMermasValue(String(inventory.mermas_alas ?? 0))
        return
      }

      const { data: previousData, error: previousError } = await supabase
        .from("inventario_diario")
        .select("stock_final")
        .lt("fecha", today)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (previousError) {
        throw previousError
      }

      setTodayInventory(null)
      setStockAnterior(previousData?.stock_final ?? 0)
      setConteoFisicoCierre("")
      setNotasCierre("")
    } catch (error) {
      console.error("Error al cargar inventario diario:", error)
      toast.error("No se pudo cargar el inventario del dia")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadTodayInventory()
    void loadAdminAccess()
  }, [])

  async function handleStartDay() {
    const nuevosIngresosValue = parseNonNegativeNumber(nuevosIngresos)

    if (nuevosIngresosValue == null) {
      toast.error("Ingresa una cantidad valida de pollos frescos")
      return
    }

    try {
      setIsStartingDay(true)

      const payload: InventarioDiarioInsert = {
        fecha: getTodayLocalISODate(),
        stock_anterior: stockAnterior,
        nuevos_ingresos: nuevosIngresosValue,
        pollos_vendidos: 0,
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
      setNuevosIngresos("")
      setConteoFisicoCierre("")
      setNotasCierre("")
      setSelectedPieceAdjustment("alas")
      setPieceVentasValue(String(inventory.ventas_alas ?? 0))
      setPieceMermasValue(String(inventory.mermas_alas ?? 0))
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

    const ingresosValue = parseNonNegativeNumber(ingresosExtra || "0")
    const devolucionValue = parseNonNegativeNumber(devolucionProveedor || "0")

    if (ingresosValue == null || devolucionValue == null) {
      toast.error("Ingresa cantidades validas para el movimiento")
      return
    }

    if (ingresosValue === 0 && devolucionValue === 0) {
      toast.error("Captura un ingreso o una devolucion al proveedor")
      return
    }

    const nextNuevosIngresos = Number(
      (todayInventory.nuevos_ingresos + ingresosValue - devolucionValue).toFixed(2),
    )

    if (nextNuevosIngresos < 0) {
      toast.error("La devolucion no puede dejar los ingresos del dia en negativo")
      return
    }

    try {
      setIsSavingIngreso(true)

      const { data, error } = await supabase
        .from("inventario_diario")
        .update({ nuevos_ingresos: nextNuevosIngresos })
        .eq("id", todayInventory.id)
        .select()
        .single()

      if (error) {
        throw error
      }

      setTodayInventory(data as InventarioDiario)
      setIngresosExtra("")
      setDevolucionProveedor("")

      if (ingresosValue > 0 && devolucionValue > 0) {
        toast.success("Ingreso y devolucion del proveedor registrados")
      } else if (ingresosValue > 0) {
        toast.success("Ingreso adicional registrado")
      } else {
        toast.success("Devolucion al proveedor registrada")
      }
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

    const mermaValue = Number(mermaAmount)

    if (!Number.isFinite(mermaValue) || mermaValue <= 0) {
      toast.error("Ingresa una cantidad valida para la merma")
      return
    }

    const generalField =
      mermaType === "quemados" ? "mermas_quemados" : "mermas_caidos"
    const pieceField = MERMA_FIELD_MAP[mermaPiece]

    const payload: InventarioDiarioUpdate = {
      [generalField]: (todayInventory[generalField] ?? 0) + mermaValue / 10,
      [pieceField]: (todayInventory[pieceField] ?? 0) + mermaValue,
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

      setTodayInventory(data as InventarioDiario)
      if (selectedPieceAdjustment === mermaPiece) {
        setPieceMermasValue(String(data[MERMA_FIELD_MAP[mermaPiece]] ?? 0))
      }
      setMermaAmount("1")
      toast.success("Merma registrada correctamente")
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

    setSelectedPieceAdjustment(pieceKey)
    setPieceVentasValue(String(todayInventory[PIECE_FIELD_MAP[pieceKey]] ?? 0))
    setPieceMermasValue(String(todayInventory[MERMA_FIELD_MAP[pieceKey]] ?? 0))
    setActiveOperationTab("ajustes")
  }

  async function handleSavePieceAdjustment() {
    if (!todayInventory || todayInventory.cerrado_en) {
      return
    }

    const ventasValue = parseNonNegativeNumber(pieceVentasValue)
    const mermasValue = parseNonNegativeNumber(pieceMermasValue)

    if (ventasValue == null || mermasValue == null) {
      toast.error("Ingresa valores validos para ventas y mermas")
      return
    }

    const ventasField = PIECE_FIELD_MAP[selectedPieceAdjustment]
    const mermasField = MERMA_FIELD_MAP[selectedPieceAdjustment]

    const payload: InventarioDiarioUpdate = {
      [ventasField]: ventasValue,
      [mermasField]: mermasValue,
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

      setTodayInventory(data as InventarioDiario)
      toast.success(`Ajuste guardado para ${PIECE_LABELS[selectedPieceAdjustment]}`)
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
      setPieceVentasValue(
        String(inventory[PIECE_FIELD_MAP[selectedPieceAdjustment]] ?? 0),
      )
      setPieceMermasValue(
        String(inventory[MERMA_FIELD_MAP[selectedPieceAdjustment]] ?? 0),
      )
      toast.success("Dia reabierto en modo administrador")
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

    const conteoValue = Number(conteoFisicoCierre)

    if (!Number.isFinite(conteoValue) || conteoValue < 0) {
      toast.error("Ingresa un conteo fisico valido")
      return
    }

    const stockEstimado = getStockFinalEquivalent(todayInventory)
    const diferencia = Number((conteoValue - stockEstimado).toFixed(2))

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

      setTodayInventory(data as InventarioDiario)

      if (diferencia === 0) {
        toast.success("Cierre de turno conciliado sin diferencias")
      } else if (diferencia > 0) {
        toast.success("Cierre de turno guardado con sobrante registrado")
      } else {
        toast.success("Cierre de turno guardado con faltante registrado")
      }
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
            Apertura de turno
          </h2>
          <p className="mt-5 text-2xl font-black text-amber-600 sm:text-3xl">
            Stock sobrante de ayer: {formatMetric(stockAnterior)} pollos
          </p>
          <div className="mt-6">
            <label
              htmlFor="nuevos-ingresos"
              className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
            >
              Cuantos pollos frescos llegaron hoy? (Ej. 10, 15, 20)
            </label>
            <input
              id="nuevos-ingresos"
              type="number"
              min="0"
              step="0.1"
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
            {isStartingDay ? "Iniciando dia..." : "Iniciar Dia"}
          </button>
        </div>
      </section>
    )
  }

  const stockDisponible = getStockFinalEquivalent(todayInventory)
  const conciliacion = todayInventory.diferencia_cierre
  const isClosed = Boolean(todayInventory.cerrado_en)
  const selectedPieceStock = getPieceStock(todayInventory, selectedPieceAdjustment)
  const selectedPieceVentas =
    todayInventory[PIECE_FIELD_MAP[selectedPieceAdjustment]] ?? 0
  const selectedPieceMermas =
    todayInventory[MERMA_FIELD_MAP[selectedPieceAdjustment]] ?? 0

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
            Cerrado el {formatDateTime(todayInventory.cerrado_en)}. Ya no deberias registrar movimientos operativos hasta reabrir el dia.
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
            Inicio del dia: {formatMetric(getTotalEnParrilla(todayInventory))} pollos
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Vendidos
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-600 sm:text-3xl">
            {formatMetric(getInventorySoldEquivalent(todayInventory))}
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
              Movimientos y correcciones
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Proveedor, mermas y correccion puntual por pieza.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
            <OperationTabButton
              active={activeOperationTab === "ajustes"}
              label="Ajuste por pieza"
              onClick={() => setActiveOperationTab("ajustes")}
            />
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
              Usa esta vista si el pollo llega despues de abrir caja o si una parte se devuelve a cambio.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="ingresos-extra" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Pollo nuevo recibido
                </label>
                <input
                  id="ingresos-extra"
                  type="number"
                  min="0"
                  step="0.01"
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
                  step="0.01"
                  value={devolucionProveedor}
                  onChange={(event) => setDevolucionProveedor(event.target.value)}
                  disabled={isClosed}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-lg font-black text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>

            <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-bold text-slate-900">Devuelto a cambio</span>{" "}
              descuenta del ingreso acumulado del dia. Puedes usar decimal en equivalencia de pollo si aplica.
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
              Registra piezas caidas, golpeadas o quemadas sin salir de la operacion del dia.
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

        {activeOperationTab === "ajustes" ? (
          <section className="mt-4 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="text-base font-black text-slate-900">
                  Correccion por pieza
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                  Ajusta directamente ventas y mermas de una pieza cuando hubo error de captura.
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Pieza seleccionada:{" "}
                <span className="font-black text-slate-900">
                  {PIECE_LABELS[selectedPieceAdjustment]}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <article className="rounded-3xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Stock estimado
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
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div>
                <label htmlFor="piece-ventas" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Ventas corregidas
                </label>
                <input
                  id="piece-ventas"
                  type="number"
                  min="0"
                  step="1"
                  value={pieceVentasValue}
                  onChange={(event) => setPieceVentasValue(event.target.value)}
                  disabled={isClosed}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-lg font-black text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div>
                <label htmlFor="piece-mermas" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Mermas corregidas
                </label>
                <input
                  id="piece-mermas"
                  type="number"
                  min="0"
                  step="1"
                  value={pieceMermasValue}
                  onChange={(event) => setPieceMermasValue(event.target.value)}
                  disabled={isClosed}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-lg font-black text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>

            <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Esta correccion edita solo la pieza seleccionada y es util para cuadrar conteos sin alterar otras piezas.
            </div>

            <button
              type="button"
              onClick={() => void handleSavePieceAdjustment()}
              disabled={isSavingPieceAdjustment || isClosed}
              className="mt-4 rounded-3xl bg-slate-900 px-5 py-3.5 text-sm font-black text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            >
              {isSavingPieceAdjustment ? "Guardando ajuste..." : "Guardar Ajuste"}
            </button>
          </section>
        ) : null}
        </div>

        <div className="rounded-[2rem] bg-slate-50 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Inventario por pieza
            </p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              Stock fisico actual
            </h3>
          </div>
          <p className="text-sm text-slate-500">
            Formula: ((stock anterior + nuevos ingresos) x 2) - ventas - mermas
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {(Object.keys(PIECE_LABELS) as InventoryPieceKey[]).map((pieceKey) => {
            const stock = getPieceStock(todayInventory, pieceKey)
            const ventas = todayInventory[PIECE_FIELD_MAP[pieceKey]] ?? 0
            const mermas = todayInventory[MERMA_FIELD_MAP[pieceKey]] ?? 0
            const isLowStock = stock < 5
            const isSelected = selectedPieceAdjustment === pieceKey

            return (
              <article
                key={pieceKey}
                className={`rounded-3xl border bg-white p-3.5 shadow-sm transition ${
                  isSelected ? "border-slate-900 ring-2 ring-slate-200" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {PIECE_LABELS[pieceKey]}
                    </p>
                    <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{stock}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {isLowStock ? (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-rose-600">
                        Bajo Stock
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openPieceAdjustment(pieceKey)}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] transition focus:outline-none focus:ring-4 focus:ring-slate-100 sm:px-3 sm:text-xs ${
                        isSelected
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      Ajustar
                    </button>
                  </div>
                </div>
                <div className="mt-2.5 space-y-1 text-[11px] text-slate-500 sm:text-xs">
                  <p>Ventas: {ventas}</p>
                  <p>Mermas: {mermas}</p>
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
                Cierre registrado: {formatDateTime(todayInventory.cerrado_en)}
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
                  step="0.01"
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
                  placeholder="Ej. Sobraron 2 pollos enteros en parrilla y una pechuga en preparacion"
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
