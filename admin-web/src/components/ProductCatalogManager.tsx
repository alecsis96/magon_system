import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import { supabase } from "../lib/supabase"
import type { Producto, ProductoCategoria, ProductoSubcategoria } from "../types/database"

type InventoryProductKey =
  | "1_pollo"
  | "3/4_pollo"
  | "1/2_pollo"
  | "1_PIEZA"
  | "combo_papas"

type ProductFormState = {
  nombre: string
  descripcion: string
  precio: string
  categoria: ProductoCategoria
  subcategoria: ProductoSubcategoria | ""
  claveInventario: "" | InventoryProductKey
  requiereVariante34: boolean
}

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
  claveInventario: "",
  requiereVariante34: false,
}

const INVENTORY_OPTIONS: Array<{
  value: "" | InventoryProductKey
  label: string
}> = [
  { value: "", label: "Sin impacto de inventario" },
  { value: "1_pollo", label: "1 Pollo" },
  { value: "3/4_pollo", label: "3/4 Pollo" },
  { value: "1/2_pollo", label: "1/2 Pollo" },
  { value: "1_PIEZA", label: "1 Pieza" },
  { value: "combo_papas", label: "Combo Papas" },
]

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

function mapProductToForm(producto: Producto): ProductFormState {
  const claveInventario =
    producto.clave_inventario === "1_pollo" ||
    producto.clave_inventario === "3/4_pollo" ||
    producto.clave_inventario === "1/2_pollo" ||
    producto.clave_inventario === "1_PIEZA" ||
    producto.clave_inventario === "1_pieza" ||
    producto.clave_inventario === "combo_papas"
      ? producto.clave_inventario === "1_pieza"
        ? "1_PIEZA"
        : producto.clave_inventario
      : ""

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

  return {
    nombre: producto.nombre,
    descripcion: producto.descripcion ?? "",
    precio: producto.precio.toString(),
    categoria,
    subcategoria,
    claveInventario,
    requiereVariante34: producto.requiere_variante_3_4 ?? false,
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
        if (value === "Extra") {
          nextForm.claveInventario = ""
          nextForm.requiereVariante34 = false
        }
      }

      if (field === "claveInventario") {
        nextForm.requiereVariante34 = value === "3/4_pollo"
      }

      return nextForm
    })
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
    const requiereVariante34 = form.claveInventario === "3/4_pollo" ? true : form.requiereVariante34

    if (!nombre) {
      toast.error("Ingresa el nombre del producto")
      return
    }

    if (!Number.isFinite(precio) || precio <= 0) {
      toast.error("Ingresa un precio valido")
      return
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
            p_clave_inventario?: string | null
            p_requiere_variante_3_4?: boolean | null
          },
        ) => Promise<{ data: Producto | null; error: Error | null }>
      }).rpc("guardar_producto_admin", {
        p_producto_id: editingProductId,
        p_nombre: nombre,
        p_descripcion: descripcion || null,
        p_precio: precio,
        p_categoria: form.categoria,
        p_subcategoria: form.subcategoria || null,
        p_clave_inventario: form.categoria === "Extra" ? null : form.claveInventario || null,
        p_requiere_variante_3_4: form.categoria === "Extra" ? false : requiereVariante34,
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
              <label htmlFor="inventory-key" className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Clave de inventario</label>
              <select
                id="inventory-key"
                value={form.claveInventario}
                onChange={(event) => handleFormChange("claveInventario", event.target.value as ProductFormState["claveInventario"])}
                disabled={!canManageProducts || form.categoria === "Extra"}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-400"
              >
                {INVENTORY_OPTIONS.map((option) => (
                  <option key={option.value || "none"} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-sm font-bold text-slate-900">Requiere variante de 3/4</p>
                <p className="mt-1 text-xs text-slate-500">Activalo solo para productos que obligan elegir combinacion.</p>
              </div>
              <input
                type="checkbox"
                checked={form.requiereVariante34}
                onChange={(event) => handleFormChange("requiereVariante34", event.target.checked)}
                disabled={!canManageProducts || form.categoria === "Extra" || form.claveInventario === "3/4_pollo"}
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
                        {producto.clave_inventario ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                            {producto.clave_inventario}
                          </span>
                        ) : null}
                        {producto.requiere_variante_3_4 ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                            Variante 3/4
                          </span>
                        ) : null}
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
