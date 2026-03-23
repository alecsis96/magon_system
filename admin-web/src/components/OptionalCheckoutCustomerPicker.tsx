import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import type { Cliente } from "../types/database"

type QuickCreateForm = {
  nombre: string
  telefono: string
}

interface OptionalCheckoutCustomerPickerProps {
  selectedCustomer: Cliente | null
  onCustomerSelect: (cliente: Cliente | null) => void
}

const EMPTY_FORM: QuickCreateForm = {
  nombre: "",
  telefono: "",
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message

    if (typeof message === "string" && message.trim()) {
      return message
    }
  }

  return "No se pudo completar la operacion."
}

export function OptionalCheckoutCustomerPicker({
  selectedCustomer,
  onCustomerSelect,
}: OptionalCheckoutCustomerPickerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Cliente[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [formData, setFormData] = useState<QuickCreateForm>(EMPTY_FORM)

  useEffect(() => {
    if (!selectedCustomer) {
      return
    }

    setSearchQuery("")
    setSearchResults([])
    setSearchError(null)
  }, [selectedCustomer])

  useEffect(() => {
    if (selectedCustomer) {
      return
    }

    const trimmedSearch = searchQuery.trim()
    const canSearch = trimmedSearch.length > 0

    if (!canSearch) {
      setIsSearching(false)
      setSearchError(null)
      setSearchResults([])
      return
    }

    let isCancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setIsSearching(true)
          setSearchError(null)

          const sanitizedSearch = trimmedSearch.replace(/,/g, " ")
          const { data, error } = await supabase
            .from("clientes")
            .select("*")
            .or(
              `nombre.ilike.%${sanitizedSearch}%,telefono.ilike.%${sanitizedSearch}%`,
            )
            .limit(6)

          if (error) {
            throw error
          }

          if (isCancelled) {
            return
          }

          setSearchResults((data ?? []) as Cliente[])
        } catch (error) {
          if (isCancelled) {
            return
          }

          console.error("Error al buscar clientes opcionales:", error)
          setSearchError(getErrorMessage(error))
          setSearchResults([])
        } finally {
          if (!isCancelled) {
            setIsSearching(false)
          }
        }
      })()
    }, 180)

    return () => {
      isCancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery, selectedCustomer])

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const hasExactMatch = searchResults.some((cliente) => {
    const normalizedName = cliente.nombre.trim().toLocaleLowerCase()
    const normalizedPhone = cliente.telefono.trim().toLocaleLowerCase()

    return normalizedName === normalizedSearch || normalizedPhone === normalizedSearch
  })

  function handleSelectCustomer(cliente: Cliente) {
    onCustomerSelect(cliente)
    setSearchQuery("")
    setSearchResults([])
    setSearchError(null)
  }

  function handleRemoveSelection() {
    onCustomerSelect(null)
    setSearchQuery("")
    setSearchResults([])
    setSearchError(null)
  }

  function handleOpenCreateModal() {
    const trimmedSearch = searchQuery.trim()
    const hasLetters = /[a-zA-Z\u00C0-\u017F]/.test(trimmedSearch)
    const hasDigits = /\d/.test(trimmedSearch)

    setFormData({
      nombre: hasLetters ? trimmedSearch : "",
      telefono: hasDigits ? trimmedSearch : "",
    })
    setSaveError(null)
    setIsCreateModalOpen(true)
  }

  function handleCloseCreateModal() {
    if (isSaving) {
      return
    }

    setIsCreateModalOpen(false)
    setSaveError(null)
    setFormData(EMPTY_FORM)
  }

  function handleFormChange(
    field: keyof QuickCreateForm,
    value: QuickCreateForm[keyof QuickCreateForm],
  ) {
    setFormData((currentForm) => ({
      ...currentForm,
      [field]: value,
    }))
  }

  async function handleCreateCustomer() {
    const nombre = formData.nombre.trim()
    const telefono = formData.telefono.trim()

    if (!nombre || !telefono) {
      setSaveError("Completa nombre y telefono para guardar.")
      return
    }

    try {
      setIsSaving(true)
      setSaveError(null)

      const { data, error } = await supabase
        .from("clientes")
        .insert({
          nombre,
          telefono,
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      const nuevoCliente = data as Cliente
      onCustomerSelect(nuevoCliente)
      setSearchQuery("")
      setSearchResults([])
      setIsCreateModalOpen(false)
      setFormData(EMPTY_FORM)
    } catch (error) {
      console.error("Error al crear cliente rapido de mostrador:", error)
      setSaveError(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const shouldShowDropdown =
    !selectedCustomer &&
    searchQuery.trim().length > 0 &&
    (isSearching || !!searchError || searchResults.length > 0)

  const showCreateOption =
    !selectedCustomer &&
    searchQuery.trim().length > 0 &&
    !isSearching &&
    !hasExactMatch

  return (
    <>
      <section className="rounded-[1.75rem] bg-slate-50 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Cliente opcional
            </p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">
              Ticket de mostrador
            </h2>
          </div>
          <div className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
            {selectedCustomer ? "Cliente ligado" : "Publico en General"}
          </div>
        </div>

        {selectedCustomer ? (
          <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Cliente seleccionado
                </p>
                <h3 className="mt-2 truncate text-lg font-black text-slate-900">
                  {selectedCustomer.nombre}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedCustomer.telefono}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoveSelection}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-base font-black text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                aria-label="Remover cliente seleccionado"
              >
                X
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={"\uD83D\uDD0D Buscar o agregar cliente (Opcional)"}
                className="w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-base font-medium text-slate-900 outline-none transition focus:border-slate-400"
              />

              {shouldShowDropdown || showCreateOption ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
                  {isSearching ? (
                    <div className="px-4 py-4 text-sm font-medium text-slate-500">
                      Buscando clientes...
                    </div>
                  ) : null}

                  {searchResults.map((cliente) => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => handleSelectCustomer(cliente)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {cliente.nombre}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {cliente.telefono}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Cliente
                      </span>
                    </button>
                  ))}

                  {showCreateOption ? (
                    <button
                      type="button"
                      onClick={handleOpenCreateModal}
                      className="flex w-full items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 text-left transition hover:bg-emerald-50 focus:outline-none focus:bg-emerald-50"
                    >
                      <div>
                        <p className="text-sm font-black text-emerald-700">
                          + Agregar nuevo cliente
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Guardar rapido para asociarlo a esta venta
                        </p>
                      </div>
                    </button>
                  ) : null}

                  {searchError ? (
                    <div className="border-t border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                      {searchError}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <p className="mt-3 text-sm text-slate-500">
              Si no eliges cliente, la venta se registra como Publico en General.
            </p>
          </div>
        )}
      </section>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-slate-900/40 p-3 sm:items-center sm:justify-center">
          <div className="w-full rounded-[1.75rem] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:max-w-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Alta rapida
                </p>
                <h3 className="mt-2 text-xl font-black text-slate-900">
                  Nuevo cliente de mostrador
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                className="rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="mostrador-quick-customer-name"
                  className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                >
                  Nombre
                </label>
                <input
                  id="mostrador-quick-customer-name"
                  type="text"
                  value={formData.nombre}
                  onChange={(event) => handleFormChange("nombre", event.target.value)}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label
                  htmlFor="mostrador-quick-customer-phone"
                  className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                >
                  Telefono
                </label>
                <input
                  id="mostrador-quick-customer-phone"
                  type="tel"
                  inputMode="tel"
                  value={formData.telefono}
                  onChange={(event) =>
                    handleFormChange("telefono", event.target.value)
                  }
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-400"
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
                onClick={handleCloseCreateModal}
                disabled={isSaving}
                className="px-4 py-3 text-sm font-semibold text-slate-500 transition hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateCustomer}
                disabled={isSaving}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(15,23,42,0.16)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                {isSaving ? "Guardando..." : "Guardar y seleccionar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default OptionalCheckoutCustomerPicker
