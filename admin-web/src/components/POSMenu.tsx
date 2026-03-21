import { useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import type { Producto } from "../types/database"

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

type ProductFilter = "todos" | "pollos" | "combos" | "extras"

interface POSMenuProps {
  onSelectProduct: (producto: Producto) => void
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase()
}

function getProductFilter(producto: Producto): ProductFilter {
  const categoria = normalize(producto.categoria)

  if (categoria === "clasico" || categoria === "clasicos") {
    return "pollos"
  }

  if (categoria === "combo" || categoria === "combos") {
    return "combos"
  }

  if (categoria === "extra" || categoria === "extras") {
    return "extras"
  }

  return "todos"
}

function getCategoryBadge(producto: Producto) {
  const filter = getProductFilter(producto)

  if (filter === "pollos") return "Pollos"
  if (filter === "combos") return "Combos"
  if (filter === "extras") return "Extras"
  return producto.categoria ?? "Menu"
}

function getSubcategoryBadge(producto: Producto) {
  const subcategoria = normalize(producto.subcategoria)

  if (!subcategoria) {
    return null
  }

  if (subcategoria === "papas_fritas") {
    return "Papas fritas"
  }

  if (subcategoria === "pollo") {
    return null
  }

  if (subcategoria === "combo") {
    return null
  }

  return subcategoria.replace(/_/g, " ")
}

function FilterButton({
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
      className={`rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition sm:px-4 sm:text-xs ${
        active
          ? "bg-white text-stone-950 shadow-[0_12px_24px_rgba(255,255,255,0.16)]"
          : "border border-white/10 bg-white/5 text-stone-300 hover:border-white/20 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  )
}

export function POSMenu({ onSelectProduct }: POSMenuProps) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<ProductFilter>("todos")

  useEffect(() => {
    async function loadProductos() {
      try {
        setIsLoading(true)
        setLoadError(null)

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
        setLoadError("No se pudo cargar el menu desde la base de datos.")
        setProductos([])
      } finally {
        setIsLoading(false)
      }
    }

    void loadProductos()
  }, [])

  const filteredProducts = useMemo(() => {
    if (activeFilter === "todos") {
      return productos
    }

    return productos.filter((producto) => getProductFilter(producto) === activeFilter)
  }, [activeFilter, productos])

  function handleSelectProduct(producto: Producto) {
    console.log("Producto seleccionado:", producto)
    onSelectProduct(producto)
  }

  return (
    <section className="min-h-full rounded-[2rem] bg-stone-950 px-3 py-4 text-stone-50 sm:px-5 sm:py-5 lg:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-col gap-3 sm:mb-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-400">
                Punto de venta
              </p>
              <h1 className="mt-1.5 text-xl font-black tracking-tight text-white sm:mt-2 sm:text-3xl">
                Menu de polleria
              </h1>
            </div>
            <p className="max-w-lg text-[11px] text-stone-300 sm:text-sm">
              Selecciona un producto para agregarlo al pedido.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterButton active={activeFilter === "todos"} label="Todos" onClick={() => setActiveFilter("todos")} />
            <FilterButton active={activeFilter === "pollos"} label="Pollos" onClick={() => setActiveFilter("pollos")} />
            <FilterButton active={activeFilter === "combos"} label="Combos" onClick={() => setActiveFilter("combos")} />
            <FilterButton active={activeFilter === "extras"} label="Extras" onClick={() => setActiveFilter("extras")} />
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 px-6 py-16 text-center text-sm font-medium text-stone-300">
            Cargando menu desde Supabase...
          </div>
        ) : loadError ? (
          <div className="rounded-3xl border border-rose-300/20 bg-rose-500/10 px-6 py-16 text-center text-sm font-medium text-rose-100">
            {loadError}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 px-6 py-16 text-center text-sm font-medium text-stone-300">
            No hay productos disponibles en esta seccion.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredProducts.map((producto) => {
              const productFilter = getProductFilter(producto)
              const isExtra = productFilter === "extras"
              const isCombo = productFilter === "combos"
              const secondaryBadge = isExtra ? null : getSubcategoryBadge(producto)

              return (
                <button
                  key={producto.id}
                  type="button"
                  onClick={() => handleSelectProduct(producto)}
                  className={`group flex flex-col justify-between rounded-[1.45rem] border text-left shadow-[0_16px_34px_rgba(0,0,0,0.24)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(0,0,0,0.3)] focus:outline-none focus:ring-4 active:scale-[0.98] ${
                    isExtra
                      ? "min-h-[124px] border-emerald-300/20 bg-gradient-to-br from-emerald-500 via-lime-500 to-amber-500 p-2.5 focus:ring-emerald-200/50 sm:min-h-[152px] sm:p-3"
                      : "min-h-[150px] border-amber-300/20 bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 p-2.5 focus:ring-amber-200/50 sm:min-h-[204px] sm:p-4"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-white/15 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/90 sm:px-2.5 sm:text-[11px]">
                      {getCategoryBadge(producto)}
                    </span>
                    {secondaryBadge ? (
                      <span className="rounded-full bg-stone-950/15 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/85 sm:text-[10px]">
                        {secondaryBadge}
                      </span>
                    ) : isCombo ? (
                      <span className="rounded-full bg-stone-950/15 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/85 sm:text-[10px]">
                        Combo
                      </span>
                    ) : null}
                  </div>

                  <div className={`mt-2.5 flex flex-1 flex-col justify-between ${isExtra ? "gap-1.5" : "gap-2"}`}>
                    <div className={isExtra ? "space-y-1.5" : "space-y-2"}>
                      <h2 className={`line-clamp-2 font-black leading-tight text-white ${isExtra ? "min-h-[2.3rem] text-[15px] sm:min-h-[2.7rem] sm:text-lg" : "min-h-[2.5rem] text-base sm:min-h-[3.5rem] sm:text-xl"}`}>
                        {producto.nombre}
                      </h2>
                      <span className={`inline-flex self-start rounded-2xl bg-stone-950/20 font-black text-white backdrop-blur-sm ${isExtra ? "px-2.5 py-1 text-[11px] sm:text-sm" : "px-2.5 py-1 text-xs sm:px-2.5 sm:py-1.5 sm:text-base"}`}>
                        {currencyFormatter.format(producto.precio)}
                      </span>
                    </div>

                    <p className={`text-orange-50/90 ${isExtra ? "line-clamp-2 min-h-[1.9rem] text-[10px] leading-relaxed sm:text-xs" : "line-clamp-3 min-h-[2.9rem] text-[11px] leading-relaxed sm:min-h-[3.2rem] sm:text-sm"}`}>
                      {producto.descripcion || "Sin descripcion"}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export default POSMenu
