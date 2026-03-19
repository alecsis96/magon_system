import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import type { Cliente, PedidoTipo } from "../types/database"

type TipoPedidoSeleccionable = Extract<PedidoTipo, "mostrador" | "domicilio">

type DisplayCustomer = {
  cliente: Cliente
  direccion: string
}

type CustomerFormData = {
  telefono: string
  nombreCompleto: string
  direccion: string
}

interface CustomerSelectorProps {
  onCustomerSelect: (cliente: Cliente | null) => void
  tipoPedido: TipoPedidoSeleccionable
  onTipoPedidoChange: (tipo: TipoPedidoSeleccionable) => void
}

const EMPTY_FORM: CustomerFormData = {
  telefono: "",
  nombreCompleto: "",
  direccion: "",
}

function mapClienteToDisplayCustomer(cliente: Cliente): DisplayCustomer {
  return {
    cliente,
    direccion: cliente.notas_entrega ?? "Sin direccion registrada",
  }
}

export function CustomerSelector({
  onCustomerSelect,
  tipoPedido,
  onTipoPedidoChange,
}: CustomerSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCustomerCard, setSelectedCustomerCard] =
    useState<DisplayCustomer | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<DisplayCustomer[]>([])
  const [formData, setFormData] = useState<CustomerFormData>(EMPTY_FORM)

  useEffect(() => {
    if (tipoPedido === "mostrador") {
      setSearchQuery("")
      setSelectedCustomerCard(null)
      setIsCreating(false)
      setIsLoading(false)
      setIsSearching(false)
      setSaveError(null)
      setSearchError(null)
      setSearchResults([])
      setFormData(EMPTY_FORM)
      onCustomerSelect(null)
      return
    }

    if (selectedCustomerCard && !isCreating) {
      return
    }

    if (isCreating) {
      setSearchResults([])
      setSearchError(null)
      onCustomerSelect(null)
      return
    }

    const trimmedSearch = searchQuery.trim()
    const normalizedNumberQuery = trimmedSearch.replace(/\D/g, "")
    const normalizedTextQuery = trimmedSearch.replace(/[^a-zA-Z]/g, "")
    const canSearch =
      normalizedNumberQuery.length >= 4 || normalizedTextQuery.length >= 3

    if (!canSearch) {
      setIsSearching(false)
      setSearchError(null)
      setSearchResults([])
      onCustomerSelect(null)
      return
    }

    let isCancelled = false

    async function runSearch() {
      try {
        setIsSearching(true)
        setSearchError(null)
        onCustomerSelect(null)

        const sanitizedSearch = trimmedSearch.replace(/,/g, " ")
        const { data, error } = await supabase
          .from("clientes")
          .select("*")
          .or(
            `nombre.ilike.%${sanitizedSearch}%,telefono.ilike.%${sanitizedSearch}%`,
          )
          .limit(5)

        if (error) {
          throw error
        }

        if (isCancelled) {
          return
        }

        const clientes = (data ?? []) as Cliente[]
        setSearchResults(clientes.map(mapClienteToDisplayCustomer))
      } catch (error) {
        if (isCancelled) {
          return
        }

        console.error("Error al buscar clientes:", error)
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo realizar la busqueda."
        setSearchError(message)
        setSearchResults([])
      } finally {
        if (!isCancelled) {
          setIsSearching(false)
        }
      }
    }

    void runSearch()

    return () => {
      isCancelled = true
    }
  }, [isCreating, onCustomerSelect, selectedCustomerCard, tipoPedido, searchQuery])

  const numericSearch = searchQuery.replace(/\D/g, "")
  const numberQueryLength = numericSearch.length
  const textQueryLength = searchQuery.replace(/[^a-zA-Z]/g, "").length
  const canSearch =
    tipoPedido === "domicilio" &&
    !isCreating &&
    searchQuery.trim().length > 0 &&
    (numberQueryLength >= 4 || textQueryLength >= 3)
  const showNoResults =
    canSearch &&
    !isSearching &&
    !searchError &&
    searchResults.length === 0 &&
    !selectedCustomerCard

  function handleStartCreating() {
    setIsCreating(true)
    setSelectedCustomerCard(null)
    setSaveError(null)
    setSearchError(null)
    onCustomerSelect(null)
    setFormData({
      telefono: numericSearch,
      nombreCompleto: "",
      direccion: "",
    })
  }

  function handleCancelCreate() {
    setIsCreating(false)
    setSaveError(null)
    setFormData(EMPTY_FORM)
  }

  function handleClearSelection() {
    setSelectedCustomerCard(null)
    setSearchQuery("")
    setIsCreating(false)
    setIsLoading(false)
    setSaveError(null)
    setSearchError(null)
    setSearchResults([])
    setFormData(EMPTY_FORM)
    onCustomerSelect(null)
  }

  function handleTipoPedidoClick(nextTipoPedido: TipoPedidoSeleccionable) {
    if (nextTipoPedido === "mostrador") {
      handleClearSelection()
      onTipoPedidoChange(nextTipoPedido)
      return
    }

    onTipoPedidoChange(nextTipoPedido)
  }

  function handleSelectCustomer(customerCard: DisplayCustomer) {
    setSelectedCustomerCard(customerCard)
    setSearchQuery(customerCard.cliente.nombre)
    setSearchResults([])
    setSearchError(null)
    onCustomerSelect(customerCard.cliente)
  }

  function handleFormChange(
    field: keyof CustomerFormData,
    value: CustomerFormData[keyof CustomerFormData],
  ) {
    setFormData((currentForm) => ({
      ...currentForm,
      [field]: value,
    }))
  }

  async function handleSaveCustomer() {
    const telefono = formData.telefono.trim()
    const nombreCompleto = formData.nombreCompleto.trim()
    const direccion = formData.direccion.trim()

    if (!telefono || !nombreCompleto || !direccion) {
      setSaveError("Completa telefono, nombre y direccion antes de guardar.")
      return
    }

    try {
      setIsLoading(true)
      setSaveError(null)

      const { data, error } = await supabase
        .from("clientes")
        .insert({
          telefono,
          nombre: nombreCompleto,
          notas_entrega: direccion,
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      const clienteGuardado = data as Cliente

      const nuevoCliente: DisplayCustomer = {
        cliente: clienteGuardado,
        direccion,
      }

      setIsCreating(false)
      setSelectedCustomerCard(nuevoCliente)
      setSearchQuery(nombreCompleto)
      setFormData(EMPTY_FORM)
      onCustomerSelect(nuevoCliente.cliente)
    } catch (error) {
      console.error("Error al guardar cliente:", error)
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo guardar el cliente. Intenta de nuevo."
      setSaveError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Tipo de pedido
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            Cliente y entrega
          </h2>
        </div>
        <div className="rounded-full bg-slate-100 p-1">
          <div className="grid grid-cols-2 gap-1">
            {(["mostrador", "domicilio"] as const).map((tipo) => {
              const isActive = tipoPedido === tipo

              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => handleTipoPedidoClick(tipo)}
                  className={`rounded-full px-5 py-3 text-sm font-bold capitalize transition ${
                    isActive
                      ? "bg-slate-900 text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)]"
                      : "text-slate-500 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  {tipo}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {tipoPedido === "domicilio" ? (
        <div className="mt-5 space-y-4">
          {selectedCustomerCard && !isCreating ? (
            <article className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                    Cliente seleccionado
                  </p>
                  <h3 className="mt-2 text-lg font-black text-slate-900">
                    {selectedCustomerCard.cliente.nombre}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedCustomerCard.direccion}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="shrink-0 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 transition hover:bg-white/70 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                >
                  Cambiar
                </button>
              </div>
            </article>
          ) : isCreating ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Registro rapido
                </p>
                <h3 className="mt-2 text-xl font-black text-slate-900">
                  Nuevo cliente
                </h3>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="new-customer-phone"
                    className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                  >
                    Telefono
                  </label>
                  <input
                    id="new-customer-phone"
                    type="text"
                    value={formData.telefono}
                    onChange={(event) =>
                      handleFormChange("telefono", event.target.value)
                    }
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-customer-name"
                    className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                  >
                    Nombre Completo
                  </label>
                  <input
                    id="new-customer-name"
                    type="text"
                    value={formData.nombreCompleto}
                    onChange={(event) =>
                      handleFormChange("nombreCompleto", event.target.value)
                    }
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-customer-address"
                    className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                  >
                    Direccion / Referencias
                  </label>
                  <textarea
                    id="new-customer-address"
                    rows={3}
                    value={formData.direccion}
                    onChange={(event) =>
                      handleFormChange("direccion", event.target.value)
                    }
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-base text-slate-900 outline-none transition focus:border-slate-400"
                  />
                </div>
              </div>

              {saveError ? (
                <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {saveError}
                </div>
              ) : null}

              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelCreate}
                  disabled={isLoading}
                  className="px-4 py-3 text-sm font-semibold text-slate-500 transition hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomer}
                  disabled={isLoading}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(15,23,42,0.16)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                >
                  {isLoading ? "Guardando..." : "Guardar Cliente"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="customer-search"
                  className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                >
                  {"BUSCAR POR N\u00DAMERO O NOMBRE"}
                </label>
                <input
                  id="customer-search"
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={"Ej. 919 123 4567 o Juan P\u00E9rez..."}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </div>

              {isSearching ? (
                <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                  Buscando...
                </div>
              ) : null}

              {searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((customerCard) => (
                    <button
                      key={customerCard.cliente.id}
                      type="button"
                      onClick={() => handleSelectCustomer(customerCard)}
                      className="w-full rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
                    >
                      <p className="text-base font-black text-slate-900">
                        {customerCard.cliente.nombre}
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-500">
                        Tel: {customerCard.cliente.telefono}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        {customerCard.direccion}
                      </p>
                    </button>
                  ))}
                </div>
              ) : searchError ? (
                <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-6 text-sm text-rose-700">
                  {searchError}
                </div>
              ) : showNoResults ? (
                <div className="space-y-3">
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                    No encontramos coincidencias para esta busqueda.
                  </div>
                  <button
                    type="button"
                    onClick={handleStartCreating}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
                  >
                    + Nuevo Cliente
                  </button>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                  Escribe al menos 4 digitos o 3 letras para simular una busqueda
                  de cliente a domicilio.
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}

export default CustomerSelector
