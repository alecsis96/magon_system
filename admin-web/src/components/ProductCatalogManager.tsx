import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import {
  getLegacyInventoryPieces,
  PIECE_LABELS,
  type InventoryPieceKey,
} from "../constants/inventory"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import { supabase } from "../lib/supabase"
import type { Producto, ProductoCategoria, ProductoSubcategoria } from "../types/database"

type InventoryDiscountMode = "fijo" | "manual" | "fijo_por_pieza"

type ProductFormState = {
  nombre: string
  descripcion: string
  precio: string
  categoria: ProductoCategoria
  subcategoria: ProductoSubcategoria | ""
  piezasInventario: number | null
  requiereVariante34: boolean
  modoDescuentoInventario: InventoryDiscountMode
  piezasASeleccionar: string
  piezasPermitidas: InventoryPieceKey[]
  permiteRepetirPiezas: boolean
  piezaFija: InventoryPieceKey
  cantidadPiezaFija: string
}

const ALL_PIECES = Object.keys(PIECE_LABELS) as InventoryPieceKey[]

const CATEGORY_OPTIONS: Array<{ value: ProductoCategoria; label: string }> = [
  { value: "Clasico", label: "Pollos" },
  { value: "Combo", label: "Combos" },
  { value: "Extra", label: "Extras" },
]

const SUBCATEGORY_OPTIONS: Record<ProductoCategoria, Array<{ value: ProductoSubcategoria; label: string }>> = {
  Clasico: [{ value: "pollo", label: "Pollo" }],
  Combo: [{ value: "combo", label: "Combo" }],
  Extra: [
    { value: "espagueti", label: "Espagueti" },
    { value: "ensalada", label: "Ensalada" },
    { value: "salsa", label: "Salsa" },
    { value: "papas_fritas", label: "Papas fritas" },
    { value: "otro", label: "Otro" },
  ],
}

const EMPTY_FORM: ProductFormState = {
  nombre: "",
  descripcion: "",
  precio: "",
  categoria: "Clasico",
  subcategoria: "pollo",
  piezasInventario: null,
  requiereVariante34: false,
  modoDescuentoInventario: "fijo",
  piezasASeleccionar: "",
  piezasPermitidas: [...ALL_PIECES],
  permiteRepetirPiezas: true,
  piezaFija: "pechugas_chicas",
  cantidadPiezaFija: "1",
}

function isInventoryPieceKey(value: unknown): value is InventoryPieceKey {
  return typeof value === "string" && (ALL_PIECES as string[]).includes(value)
}

function parseAllowedPieces(value: unknown): InventoryPieceKey[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((piece) => isInventoryPieceKey(piece))
}

function parseFixedBreakdown(value: unknown): Record<InventoryPieceKey, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const result = {
    alas: 0,
    piernas: 0,
    muslos: 0,
    pechugas_grandes: 0,
    pechugas_chicas: 0,
  }

  let hasAnyPiece = false

  for (const piece of ALL_PIECES) {
    const rawValue = (value as Record<string, unknown>)[piece]

    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      continue
    }

    const normalizedValue = Math.max(0, Math.trunc(rawValue))
    result[piece] = normalizedValue

    if (normalizedValue > 0) {
      hasAnyPiece = true
    }
  }

  return hasAnyPiece ? result : null
}

function getFirstFixedPiece(
  breakdown: Record<InventoryPieceKey, number> | null,
): { piece: InventoryPieceKey; quantity: number } {
  if (!breakdown) {
    return { piece: "pechugas_chicas", quantity: 1 }
  }

  const selectedPiece = ALL_PIECES.find((piece) => breakdown[piece] > 0)

  if (!selectedPiece) {
    return { piece: "pechugas_chicas", quantity: 1 }
  }

  return {
    piece: selectedPiece,
    quantity: breakdown[selectedPiece],
  }
}

function getInventoryModeLabel(mode: InventoryDiscountMode) {
  if (mode === "manual") return "Manual"
  if (mode === "fijo_por_pieza") return "Fijo por pieza"
  return "Fijo"
}

function getCategoryLabel(categoria: string | null) {
  if (!categoria) return "Sin categoria"
  if (categoria.toLowerCase() === "clasico") return "Pollos"
  if (categoria.toLowerCase() === "combo") return "Combos"
  if (categoria.toLowerCase() === "extra") return "Extras"
  return categoria
}

function getSubcategoryLabel(subcategoria: string | null) {
  if (!subcategoria) return null

  const normalized = subcategoria.toLowerCase()
  const allOptions = Object.values(SUBCATEGORY_OPTIONS).flat()
  const found = allOptions.find((option) => option.value.toLowerCase() === normalized)

  return found?.label ?? subcategoria
}

function getInventoryImpactLabel(producto: Producto) {
  const piezasInventario = producto.piezas_inventario ?? getLegacyInventoryPieces(producto.clave_inventario)

  if (typeof piezasInventario === "number" && piezasInventario > 0) {
    return `${piezasInventario} pzs`
  }

  return null
}

function mapProductToForm(producto: Producto): ProductFormState {
  const categoria =
    producto.categoria === "Clasico" ||
    producto.categoria === "Combo" ||
    producto.categoria === "Extra"
      ? producto.categoria
      : "Clasico"

  const validSubcategories = SUBCATEGORY_OPTIONS[categoria]
  const subcategoria =
    validSubcategories.find((option) => option.value === producto.subcategoria)?.value ??
    validSubcategories[0]?.value ??
    ""

  const modoDescuentoInventario: InventoryDiscountMode =
    producto.modo_descuento_inventario === "manual"
      ? "manual"
      : producto.modo_descuento_inventario === "fijo_por_pieza"
        ? "fijo_por_pieza"
        : "fijo"
  const parsedAllowedPieces = parseAllowedPieces(producto.piezas_permitidas)
  const parsedFixedBreakdown = parseFixedBreakdown(producto.desglose_fijo)
  const fixedConfig = getFirstFixedPiece(parsedFixedBreakdown)

  return {
    nombre: producto.nombre,
    descripcion: producto.descripcion ?? "",
    precio: producto.precio.toString(),
    categoria,
    subcategoria,
    piezasInventario:
      producto.piezas_inventario ?? getLegacyInventoryPieces(producto.clave_inventario),
    requiereVariante34: producto.requiere_variante_3_4 ?? false,
    modoDescuentoInventario,
    piezasASeleccionar:
      modoDescuentoInventario === "manual"
        ? String(
            producto.piezas_a_seleccionar ??
              (producto.piezas_inventario && producto.piezas_inventario > 0
                ? producto.piezas_inventario
                : 1),
          )
        : "",
    piezasPermitidas:
      modoDescuentoInventario === "manual"
        ? parsedAllowedPieces.length > 0
          ? parsedAllowedPieces
          : [...ALL_PIECES]
        : [...ALL_PIECES],
    permiteRepetirPiezas: producto.permite_repetir_piezas ?? true,
    piezaFija: fixedConfig.piece,
    cantidadPiezaFija:
      modoDescuentoInventario === "fijo_por_pieza"
        ? String(fixedConfig.quantity)
        : "1",
  }
}

export function ProductCatalogManager() {
  const [adminAccess, setAdminAccess] = useState<AdminAccess>({
    isAuthenticated: false,
    isAdmin: false,
    email: null,
  })
  const [productos, setProductos] = useState<Producto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM)

  async function loadProductos() {
    try {
      setIsLoading(true)

      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .order("categoria", { ascending: true })
        .order("subcategoria", { ascending: true })
        .order("nombre", { ascending: true })

      if (error) {
        throw error
      }

      setProductos((data ?? []) as Producto[])
    } catch (error) {
      console.error("Error al cargar productos:", error)
      toast.error("No se pudo cargar el catalogo de productos")
    } finally {
      setIsLoading(false)
    }
  }

  async function loadAdminState() {
    try {
      const access = await getAdminAccess()
      setAdminAccess(access)
    } catch (error) {
      console.error("Error al validar acceso admin:", error)
      setAdminAccess({ isAuthenticated: false, isAdmin: false, email: null })
    }
  }

  useEffect(() => {
    void loadProductos()
    void loadAdminState()
  }, [])

  function handleFormChange<K extends keyof ProductFormState>(field: K, value: ProductFormState[K]) {
    setForm((currentForm) => {
      const nextForm = {
        ...currentForm,
        [field]: value,
      }

      if (field === "categoria") {
        nextForm.subcategoria = SUBCATEGORY_OPTIONS[value as ProductoCategoria][0]?.value ?? ""
      }

      if (field === "piezasInventario" && value !== 7) {
        nextForm.requiereVariante34 = false
      }

      if (field === "modoDescuentoInventario") {
        if (value === "manual") {
          nextForm.piezasASeleccionar =
            nextForm.piezasASeleccionar ||
            String(nextForm.piezasInventario && nextForm.piezasInventario > 0 ? nextForm.piezasInventario : 1)
          nextForm.piezasPermitidas = nextForm.piezasPermitidas.length > 0
            ? nextForm.piezasPermitidas
            : [...ALL_PIECES]
        }

        if (value === "fijo_por_pieza") {
          nextForm.cantidadPiezaFija = nextForm.cantidadPiezaFija || "1"
        }
      }

      return nextForm
    })
  }

  function toggleAllowedPiece(piece: InventoryPieceKey) {
    setForm((currentForm) => {
      const alreadySelected = currentForm.piezasPermitidas.includes(piece)

      if (alreadySelected) {
        return {
          ...currentForm,
          piezasPermitidas: currentForm.piezasPermitidas.filter(
            (currentPiece) => currentPiece !== piece,
          ),
        }
      }

      return {
        ...currentForm,
        piezasPermitidas: [...currentForm.piezasPermitidas, piece],
      }
    })
  }

  function handleInventoryPiecesChange(rawValue: string) {
    const normalizedValue = rawValue.trim()

    if (!normalizedValue) {
      handleFormChange("piezasInventario", null)
      return
    }

    const parsedValue = Number.parseInt(normalizedValue, 10)

    handleFormChange(
      "piezasInventario",
      Number.isNaN(parsedValue) ? null : parsedValue,
    )
  }

  function handleEditProduct(producto: Producto) {
    if (!adminAccess.isAdmin) {
      toast.error("Solo un administrador puede editar productos")
      return
    }

    setEditingProductId(producto.id)
    setForm(mapProductToForm(producto))
  }

  function handleResetForm() {
    setEditingProductId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSaveProduct() {
    if (!adminAccess.isAuthenticated) {
      toast.error("Debes iniciar sesion como administrador")
      return
    }

    if (!adminAccess.isAdmin) {
      toast.error("Tu usuario no tiene permisos para modificar productos")
      return
    }

    const nombre = form.nombre.trim()
    const descripcion = form.descripcion.trim()
    const precio = Number(form.precio)
    const piezasInventario =
      typeof form.piezasInventario === "number" && form.piezasInventario > 0
        ? form.piezasInventario
        : null
    const requiereVariante34 = piezasInventario === 7 ? form.requiereVariante34 : false
    const modoDescuentoInventario = form.modoDescuentoInventario
    const piezasASeleccionar =
      modoDescuentoInventario === "manual"
        ? Number.parseInt(form.piezasASeleccionar.trim(), 10)
        : null
    const cantidadPiezaFija =
      modoDescuentoInventario === "fijo_por_pieza"
        ? Number.parseInt(form.cantidadPiezaFija.trim(), 10)
        : null
    const piezasPermitidas =
      modoDescuentoInventario === "manual"
        ? form.piezasPermitidas
        : null
    const permiteRepetirPiezas =
      modoDescuentoInventario === "manual" ? form.permiteRepetirPiezas : true
    const desgloseFijo =
      modoDescuentoInventario === "fijo_por_pieza"
        ? {
            alas: 0,
            piernas: 0,
            muslos: 0,
            pechugas_grandes: 0,
            pechugas_chicas: 0,
            [form.piezaFija]: Number.isFinite(cantidadPiezaFija) && cantidadPiezaFija && cantidadPiezaFija > 0
              ? cantidadPiezaFija
              : 1,
          }
        : null

    if (!nombre) {
      toast.error("Ingresa el nombre del producto")
      return
    }

    if (!Number.isFinite(precio) || precio <= 0) {
      toast.error("Ingresa un precio valido")
      return
    }

    if (
      piezasInventario !== null &&
      (!Number.isInteger(piezasInventario) || piezasInventario < 0)
    ) {
      toast.error("Las piezas de inventario deben ser un numero entero positivo")
      return
    }

    if (modoDescuentoInventario === "manual") {
      if (!Number.isInteger(piezasASeleccionar) || (piezasASeleccionar ?? 0) < 1) {
        toast.error("En modo manual define cuantas piezas debe seleccionar el operador")
        return
      }

      const piezasASeleccionarManual = piezasASeleccionar as number

      if (!piezasPermitidas || piezasPermitidas.length === 0) {
        toast.error("En modo manual debes permitir al menos una pieza")
        return
      }

      if (!permiteRepetirPiezas && piezasASeleccionarManual > piezasPermitidas.length) {
        toast.error("Sin repeticion, la cantidad a seleccionar no puede superar las piezas permitidas")
        return
      }
    }

    if (modoDescuentoInventario === "fijo_por_pieza") {
      if (!Number.isInteger(cantidadPiezaFija) || (cantidadPiezaFija ?? 0) < 1) {
        toast.error("La cantidad de pieza fija debe ser un entero mayor o igual a 1")
        return
      }
    }

    try {
      setIsSaving(true)
      const { error } = await (supabase as typeof supabase & {
        rpc: (
          fn: "guardar_producto_admin",
          args: {
            p_producto_id?: string | null
            p_nombre?: string | null
            p_descripcion?: string | null
            p_precio?: number | null
            p_categoria?: string | null
            p_subcategoria?: string | null
            p_piezas_inventario?: number | null
            p_requiere_variante_3_4?: boolean | null
            p_modo_descuento_inventario?: string | null
            p_piezas_a_seleccionar?: number | null
            p_piezas_permitidas?: InventoryPieceKey[] | null
            p_permite_repetir_piezas?: boolean | null
            p_desglose_fijo?: Record<InventoryPieceKey, number> | null
          },
        ) => Promise<{ data: Producto | null; error: Error | null }>
      }).rpc("guardar_producto_admin", {
        p_producto_id: editingProductId,
        p_nombre: nombre,
        p_descripcion: descripcion || null,
        p_precio: precio,
        p_categoria: form.categoria,
        p_subcategoria: form.subcategoria || null,
        p_piezas_inventario: piezasInventario,
        p_requiere_variante_3_4: requiereVariante34,
        p_modo_descuento_inventario: modoDescuentoInventario,
        p_piezas_a_seleccionar:
          modoDescuentoInventario === "manual" ? piezasASeleccionar : null,
        p_piezas_permitidas: piezasPermitidas,
        p_permite_repetir_piezas: permiteRepetirPiezas,
        p_desglose_fijo: desgloseFijo,
      })

      if (error) {
        throw error
      }

      toast.success(editingProductId ? "Producto actualizado" : "Producto creado")
      handleResetForm()
      await loadProductos()
    } catch (error) {
      console.error("Error al guardar producto:", error)
      toast.error("No se pudo guardar el producto")
    } finally {
      setIsSaving(false)
    }
  }

  const canManageProducts = adminAccess.isAdmin

  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Catalogo</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Productos</h2>
          <p className="mt-2 text-sm text-slate-500">Administra precios, categoria visual y reglas de inventario del menu.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="font-bold text-slate-900">
              {canManageProducts
                ? "Admin verificado"
                : adminAccess.isAuthenticated
                  ? "Usuario sin permisos admin"
                  : "Admin requiere sesion"}
            </p>
            <p className="mt-1 text-xs text-slate-500">{adminAccess.email ?? "No hay sesion iniciada"}</p>
          </div>

          <button
            type="button"
            onClick={() => void loadProductos()}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100"
          >
            Recargar catalogo
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
        <article className="rounded-[2rem] bg-slate-50 p-6">
          {!canManageProducts ? (
            <div className="mb-5 rounded-3xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
              Inicia sesion con un usuario administrador autorizado en Supabase para crear o editar productos.
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {editingProductId ? "Edicion" : "Alta rapida"}
              </p>
              <h3 className="mt-2 text-2xl font-black text-slate-900">
                {editingProductId ? "Editar producto" : "Nuevo producto"}
              </h3>
            </div>

            {editingProductId ? (
              <button
                type="button"
                onClick={handleResetForm}
                disabled={!canManageProducts}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-100"
              >
                Nuevo
              </button>
            ) : null}
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="product-name" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Nombre</label>
              <input
                id="product-name"
                type="text"
                value={form.nombre}
                onChange={(event) => handleFormChange("nombre", event.target.value)}
                disabled={!canManageProducts}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-400"
              />
            </div>

            <div>
              <label htmlFor="product-description" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Descripcion</label>
              <textarea
                id="product-description"
                rows={3}
                value={form.descripcion}
                onChange={(event) => handleFormChange("descripcion", event.target.value)}
                disabled={!canManageProducts}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-base text-slate-900 outline-none transition focus:border-slate-400"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="product-price" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Precio</label>
                <input
                  id="product-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio}
                  onChange={(event) => handleFormChange("precio", event.target.value)}
                  disabled={!canManageProducts}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label htmlFor="product-category" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Categoria visual</label>
                <select
                  id="product-category"
                  value={form.categoria}
                  onChange={(event) => handleFormChange("categoria", event.target.value as ProductoCategoria)}
                  disabled={!canManageProducts}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="product-subcategory" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Subcategoria</label>
              <select
                id="product-subcategory"
                value={form.subcategoria}
                onChange={(event) => handleFormChange("subcategoria", event.target.value as ProductoSubcategoria)}
                disabled={!canManageProducts}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-400"
              >
                {SUBCATEGORY_OPTIONS[form.categoria].map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="inventory-discount-mode" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Modo descuento inventario
              </label>
              <select
                id="inventory-discount-mode"
                value={form.modoDescuentoInventario}
                onChange={(event) =>
                  handleFormChange(
                    "modoDescuentoInventario",
                    event.target.value as InventoryDiscountMode,
                  )
                }
                disabled={!canManageProducts}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-400"
              >
                <option value="fijo">Fijo (desglose por defecto)</option>
                <option value="manual">Manual (seleccion en caja)</option>
                <option value="fijo_por_pieza">Fijo por pieza</option>
              </select>
            </div>

            {form.modoDescuentoInventario === "manual" ? (
              <div className="space-y-3 rounded-3xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                  Configuracion manual
                </p>

                <div>
                  <label htmlFor="manual-pieces-count" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Piezas a seleccionar en caja
                  </label>
                  <input
                    id="manual-pieces-count"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={form.piezasASeleccionar}
                    onChange={(event) => handleFormChange("piezasASeleccionar", event.target.value)}
                    disabled={!canManageProducts}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                  />
                </div>

                <div>
                  <p className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Piezas permitidas
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {ALL_PIECES.map((pieceKey) => {
                      const isSelected = form.piezasPermitidas.includes(pieceKey)

                      return (
                        <button
                          key={pieceKey}
                          type="button"
                          onClick={() => toggleAllowedPiece(pieceKey)}
                          disabled={!canManageProducts}
                          className={`rounded-2xl border px-3 py-2 text-left text-xs font-bold transition ${
                            isSelected
                              ? "border-sky-500 bg-sky-600 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {PIECE_LABELS[pieceKey]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Permitir repetir piezas</p>
                    <p className="mt-1 text-xs text-slate-500">Si esta activo, se puede elegir la misma pieza mas de una vez.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.permiteRepetirPiezas}
                    onChange={(event) => handleFormChange("permiteRepetirPiezas", event.target.checked)}
                    disabled={!canManageProducts}
                    className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                  />
                </label>
              </div>
            ) : null}

            {form.modoDescuentoInventario === "fijo_por_pieza" ? (
              <div className="space-y-3 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Configuracion fija por pieza
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="fixed-piece-key" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Pieza fija</label>
                    <select
                      id="fixed-piece-key"
                      value={form.piezaFija}
                      onChange={(event) => handleFormChange("piezaFija", event.target.value as InventoryPieceKey)}
                      disabled={!canManageProducts}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                    >
                      {ALL_PIECES.map((pieceKey) => (
                        <option key={pieceKey} value={pieceKey}>{PIECE_LABELS[pieceKey]}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="fixed-piece-quantity" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Cantidad por unidad</label>
                    <input
                      id="fixed-piece-quantity"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={form.cantidadPiezaFija}
                      onChange={(event) => handleFormChange("cantidadPiezaFija", event.target.value)}
                      disabled={!canManageProducts}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {form.modoDescuentoInventario === "fijo" ? (
              <div className="rounded-3xl border border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                Se mantiene el desglose fijo por defecto (compatibilidad actual).
              </div>
            ) : null}

            <div>
              <label htmlFor="inventory-pieces" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Piezas a descontar del inventario
              </label>
              <input
                id="inventory-pieces"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={form.piezasInventario ?? ""}
                onChange={(event) => handleInventoryPiecesChange(event.target.value)}
                placeholder="Ej. 10 para pollo entero, 5 para medio pollo"
                disabled={!canManageProducts}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-400"
              />
              <p className="mt-2 text-xs text-slate-500">
                Deja vacio o en 0 si el producto no debe descontar inventario principal.
              </p>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-sm font-bold text-slate-900">Requiere variante de 3/4</p>
                <p className="mt-1 text-xs text-slate-500">Activalo solo cuando el producto descuenta 7 piezas y obliga elegir combinacion.</p>
              </div>
              <input
                type="checkbox"
                checked={form.requiereVariante34}
                onChange={(event) => handleFormChange("requiereVariante34", event.target.checked)}
                disabled={!canManageProducts || form.piezasInventario !== 7}
                className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void handleSaveProduct()}
            disabled={!canManageProducts || isSaving}
            className="mt-6 w-full rounded-3xl bg-slate-900 px-6 py-5 text-lg font-black text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
          >
            {isSaving ? "Guardando..." : editingProductId ? "Actualizar producto" : "Guardar producto"}
          </button>
        </article>

        <article className="rounded-[2rem] bg-slate-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Catalogo actual</p>
          <h3 className="mt-2 text-2xl font-black text-slate-900">Productos registrados</h3>

          <div className="mt-5 space-y-3">
            {isLoading ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm font-medium text-slate-500">
                Cargando productos...
              </div>
            ) : productos.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm font-medium text-slate-500">
                No hay productos registrados todavia.
              </div>
            ) : (
              productos.map((producto) => (
                <article key={producto.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                          {getCategoryLabel(producto.categoria)}
                        </span>
                        {producto.subcategoria ? (
                          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">
                            {getSubcategoryLabel(producto.subcategoria)}
                          </span>
                        ) : null}
                        {getInventoryImpactLabel(producto) ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                            {getInventoryImpactLabel(producto)}
                          </span>
                        ) : null}
                        {producto.requiere_variante_3_4 ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                            Variante 3/4
                          </span>
                        ) : null}
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
                          {getInventoryModeLabel(
                            (producto.modo_descuento_inventario as InventoryDiscountMode) ?? "fijo",
                          )}
                        </span>
                      </div>

                      <h4 className="mt-3 text-lg font-black text-slate-900">{producto.nombre}</h4>
                      <p className="mt-1 text-sm text-slate-500">{producto.descripcion || "Sin descripcion"}</p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-lg font-black text-slate-900">${producto.precio}</p>
                      <button
                        type="button"
                        onClick={() => handleEditProduct(producto)}
                        disabled={!canManageProducts}
                        className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  )
}

export default ProductCatalogManager
