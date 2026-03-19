import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import type { Producto } from "../types/database"

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

interface POSMenuProps {
  onSelectProduct: (producto: Producto) => void
}

export function POSMenu({ onSelectProduct }: POSMenuProps) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProductos() {
      try {
        setIsLoading(true)
        setLoadError(null)

        const { data, error } = await supabase
          .from("productos")
          .select("*")
          .order("categoria", { ascending: true })
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

  function handleSelectProduct(producto: Producto) {
    console.log("Producto seleccionado:", producto)
    onSelectProduct(producto)
  }

  return (
    <section className="h-full rounded-[2rem] bg-stone-950 px-4 py-5 text-stone-50 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-400">
              Punto de venta
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Menu de polleria
            </h1>
          </div>
          <p className="max-w-lg text-xs text-stone-300 sm:text-sm">
            Selecciona un producto para agregarlo al pedido. Menu optimizado para
            captura rapida en pantalla tactil.
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 px-6 py-16 text-center text-sm font-medium text-stone-300">
            Cargando menu desde Supabase...
          </div>
        ) : loadError ? (
          <div className="rounded-3xl border border-rose-300/20 bg-rose-500/10 px-6 py-16 text-center text-sm font-medium text-rose-100">
            {loadError}
          </div>
        ) : productos.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 px-6 py-16 text-center text-sm font-medium text-stone-300">
            No hay productos disponibles en el catalogo.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {productos.map((producto) => (
              <button
                key={producto.id}
                type="button"
                onClick={() => handleSelectProduct(producto)}
                className="group flex min-h-[188px] flex-col justify-between rounded-[1.6rem] border border-amber-300/20 bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 p-3.5 text-left shadow-[0_16px_34px_rgba(0,0,0,0.24)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(0,0,0,0.3)] focus:outline-none focus:ring-4 focus:ring-amber-200/50 active:scale-[0.98] sm:min-h-[204px] sm:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/90 sm:text-[11px]">
                    {producto.categoria ?? "Menu"}
                  </span>
                  <span className="rounded-2xl bg-stone-950/20 px-2.5 py-1.5 text-base font-black text-white backdrop-blur-sm sm:text-lg">
                    {currencyFormatter.format(producto.precio)}
                  </span>
                </div>

                <div className="mt-4">
                  <h2 className="text-lg font-black leading-tight text-white sm:text-xl">
                    {producto.nombre}
                  </h2>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-orange-50/90 sm:text-sm">
                    {producto.descripcion}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl bg-stone-950/20 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur-sm sm:text-sm">
                  <span>Agregar</span>
                  <span className="text-base transition group-hover:translate-x-1">
                    +
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default POSMenu
