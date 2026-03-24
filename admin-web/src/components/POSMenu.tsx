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

function getCategoryBadgeTone(producto: Producto) {
  const filter = getProductFilter(producto)

  if (filter === "pollos") {
    return "bg-orange-50 text-orange-600"
  }

  if (filter === "combos") {
    return "bg-sky-50 text-sky-600"
  }

  if (filter === "extras") {
    return "bg-emerald-50 text-emerald-600"
  }

  return "bg-gray-100 text-gray-600"
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
      className={`rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition sm:px-4 sm:text-xs ${
        active
          ? "border-gray-800 bg-gray-800 text-white shadow-sm"
          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700"
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
    <section className="min-h-full rounded-[2rem] bg-gray-50 px-4 py-4 text-gray-900 sm:px-5 sm:py-5 lg:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-col gap-3 sm:mb-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-gray-500">
                Punto de venta
              </p>
              <h1 className="mt-1.5 text-xl font-black tracking-tight text-gray-900 sm:mt-2 sm:text-3xl">
                Menu de polleria
              </h1>
            </div>
            <p className="max-w-lg text-[11px] text-gray-500 sm:text-sm">
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
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center text-sm font-medium text-gray-500">
            Cargando menu desde Supabase...
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-16 text-center text-sm font-medium text-rose-700">
            {loadError}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center text-sm font-medium text-gray-500">
            No hay productos disponibles en esta seccion.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredProducts.map((producto) => {
              return (
                <button
                  key={producto.id}
                  type="button"
                  onClick={() => handleSelectProduct(producto)}
                  className="flex min-h-[182px] flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition-all duration-150 hover:border-gray-200 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-gray-200 active:scale-95 active:shadow-inner sm:min-h-[206px]"
                >
                  <div>
                    <span
                      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${getCategoryBadgeTone(producto)}`}
                    >
                      {getCategoryBadge(producto)}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-1 flex-col justify-between">
                    <div>
                      <h2 className="text-lg font-semibold leading-tight text-gray-900">
                        {producto.nombre}
                      </h2>
                      <p className="mt-1.5 line-clamp-2 text-sm text-gray-600">
                        {producto.descripcion || "Sin descripcion"}
                      </p>
                    </div>

                    <p className="mt-4 text-xl font-extrabold text-gray-950">
                      {currencyFormatter.format(producto.precio)}
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
