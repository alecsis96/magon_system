import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { supabase } from "../lib/supabase"
import type { Cliente } from "../types/database"

type CustomerFormData = {
  nombre: string
  telefono: string
  direccionHabitual: string
  referencias: string
}

const EMPTY_FORM: CustomerFormData = {
  nombre: "",
  telefono: "",
  direccionHabitual: "",
  referencias: "",
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

function buildNotasEntrega(
  direccionHabitual: string,
  referencias: string,
): string | null {
  const address = direccionHabitual.trim()
  const refs = referencias.trim()

  if (!address && !refs) {
    return null
  }

  if (!refs) {
    return address
  }

  if (!address) {
    return `Referencias: ${refs}`
  }

  return `${address}\nReferencias: ${refs}`
}

function getDireccionHabitual(cliente: Cliente) {
  return cliente.direccion_habitual?.trim() || cliente.notas_entrega?.trim() || ""
}

function getReferencias(cliente: Cliente) {
  return cliente.referencias?.trim() || ""
}

function mapClientToForm(cliente: Cliente): CustomerFormData {
  return {
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    direccionHabitual: getDireccionHabitual(cliente),
    referencias: getReferencias(cliente),
  }
}

function hasFacadePhoto(cliente: Cliente) {
  const rawUrl = cliente.url_foto_fachada?.trim()

  if (!rawUrl) {
    return false
  }

  try {
    new URL(rawUrl, window.location.origin)
    return true
  } catch {
    return false
  }
}

function hasFacadeIssue(cliente: Cliente) {
  return cliente.foto_valida === false || !hasFacadePhoto(cliente)
}

function replaceClient(currentClients: Cliente[], updatedClient: Cliente) {
  return currentClients.map((client) =>
    client.id === updatedClient.id ? updatedClient : client,
  )
}

function AlertTriangleIcon({ className }: { className?: string }) {
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
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  )
}

export function CustomerDirectoryAudit() {
  const [searchQuery, setSearchQuery] = useState("")
  const [clients, setClients] = useState<Cliente[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null)
  const [formData, setFormData] = useState<CustomerFormData>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [isFlaggingPhoto, setIsFlaggingPhoto] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)

  useEffect(() => {
    let isCancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setIsLoading(true)
          setLoadError(null)

          const trimmedSearch = searchQuery.trim()
          let query = supabase.from("clientes").select("*").order("nombre").limit(80)

          if (trimmedSearch) {
            const sanitizedSearch = trimmedSearch.replace(/,/g, " ")
            query = query.or(
              `nombre.ilike.%${sanitizedSearch}%,telefono.ilike.%${sanitizedSearch}%`,
            )
          }

          const { data, error } = await query

          if (error) {
            throw error
          }

          if (isCancelled) {
            return
          }

          setClients((data ?? []) as Cliente[])
        } catch (error) {
          if (isCancelled) {
            return
          }

          console.error("Error al cargar directorio de clientes:", error)
          setLoadError(getErrorMessage(error))
          setClients([])
        } finally {
          if (!isCancelled) {
            setIsLoading(false)
          }
        }
      })()
    }, 220)

    return () => {
      isCancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery])

  useEffect(() => {
    if (!selectedClient) {
      setFormData(EMPTY_FORM)
      setModalError(null)
      setKeyboardInset(0)
      return
    }

    setFormData(mapClientToForm(selectedClient))
    setModalError(null)
    setImageLoadFailed(false)
  }, [selectedClient])

  useEffect(() => {
    if (!selectedClient) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [selectedClient])

  useEffect(() => {
    if (!selectedClient || !window.visualViewport) {
      return
    }

    const viewport = window.visualViewport

    function updateKeyboardInset() {
      const nextInset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      )

      setKeyboardInset(nextInset)
    }

    updateKeyboardInset()
    viewport.addEventListener("resize", updateKeyboardInset)
    viewport.addEventListener("scroll", updateKeyboardInset)

    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset)
      viewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [selectedClient])

  function handleFormChange(
    field: keyof CustomerFormData,
    value: CustomerFormData[keyof CustomerFormData],
  ) {
    setFormData((currentForm) => ({
      ...currentForm,
      [field]: value,
    }))
  }

  function handleOpenClient(cliente: Cliente) {
    setSelectedClient(cliente)
  }

  function handleCloseClient() {
    setSelectedClient(null)
    setModalError(null)
    setKeyboardInset(0)
  }

  async function handleMarkPhotoForRepeat() {
    if (!selectedClient || selectedClient.foto_valida === false) {
      return
    }

    try {
      setIsFlaggingPhoto(true)
      setModalError(null)

      const { data, error } = await supabase
        .from("clientes")
        .update({ foto_valida: false })
        .eq("id", selectedClient.id)
        .select()
        .single()

      if (error) {
        throw error
      }

      const updatedClient = data as Cliente
      setSelectedClient(updatedClient)
      setClients((currentClients) => replaceClient(currentClients, updatedClient))
      toast.success("La foto quedo marcada para repetir.")
    } catch (error) {
      console.error("Error al marcar foto para repetir:", error)
      const message = getErrorMessage(error)
      setModalError(message)
      toast.error(message)
    } finally {
      setIsFlaggingPhoto(false)
    }
  }

  async function handleSaveChanges() {
    if (!selectedClient) {
      return
    }

    const nombre = formData.nombre.trim()
    const telefono = formData.telefono.trim()
    const direccionHabitual = formData.direccionHabitual.trim()
    const referencias = formData.referencias.trim()

    if (!nombre || !telefono) {
      const message = "Nombre y telefono son obligatorios."
      setModalError(message)
      toast.error(message)
      return
    }

    try {
      setIsSaving(true)
      setModalError(null)

      const { data, error } = await supabase
        .from("clientes")
        .update({
          nombre,
          telefono,
          direccion_habitual: direccionHabitual || null,
          referencias: referencias || null,
          notas_entrega: buildNotasEntrega(direccionHabitual, referencias),
        })
        .eq("id", selectedClient.id)
        .select()
        .single()

      if (error) {
        throw error
      }

      const updatedClient = data as Cliente
      setSelectedClient(updatedClient)
      setClients((currentClients) => replaceClient(currentClients, updatedClient))
      toast.success("Cliente actualizado.")
    } catch (error) {
      console.error("Error al guardar cambios del cliente:", error)
      const message = getErrorMessage(error)
      setModalError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const selectedClientHasFacade =
    selectedClient &&
    selectedClient.foto_valida !== false &&
    hasFacadePhoto(selectedClient)

  return (
    <section className="flex flex-1 flex-col bg-gray-50">
      <div className="sticky top-0 z-10 bg-white p-4 shadow-sm">
        <label htmlFor="customer-audit-search" className="sr-only">
          Buscar por nombre o telefono
        </label>
        <input
          id="customer-audit-search"
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Buscar por nombre o telefono"
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-base text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
        />
      </div>

      <div className="flex-1 px-3 py-3">
        {isLoading ? (
          <div className="rounded-3xl bg-white px-4 py-6 text-sm font-medium text-slate-500 shadow-sm">
            Cargando clientes...
          </div>
        ) : loadError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm font-medium text-rose-700 shadow-sm">
            {loadError}
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm">
            No hay clientes que coincidan con esta busqueda.
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map((client) => {
              const showAlert = hasFacadeIssue(client)

              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => handleOpenClient(client)}
                  className="flex w-full items-center gap-3 rounded-3xl bg-white px-4 py-4 text-left shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-900 text-lg font-black text-white">
                    {client.nombre.trim().charAt(0).toUpperCase() || "C"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-slate-900">
                      {client.nombre}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{client.telefono}</p>
                  </div>

                  {showAlert ? (
                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                      <AlertTriangleIcon className="h-4 w-4" />
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedClient ? (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div
            className="min-h-full bg-white pb-32"
            style={{
              paddingBottom: `${160 + keyboardInset}px`,
            }}
          >
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Directorio y auditoria
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  {selectedClient.nombre}
                </h2>
              </div>

              <button
                type="button"
                onClick={handleCloseClient}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
              >
                Volver
              </button>
            </div>

            {selectedClientHasFacade && !imageLoadFailed ? (
              <img
                src={selectedClient.url_foto_fachada ?? ""}
                alt={`Fachada de ${selectedClient.nombre}`}
                className="h-48 w-full object-cover"
                onError={() => setImageLoadFailed(true)}
              />
            ) : (
              <div className="flex h-48 w-full items-center justify-center bg-slate-200 px-6 text-center text-sm font-medium text-slate-600">
                Foto de fachada no disponible o marcada como invalida.
              </div>
            )}

            <div className="px-4 pt-4">
              <button
                type="button"
                onClick={handleMarkPhotoForRepeat}
                disabled={isFlaggingPhoto || selectedClient.foto_valida === false}
                className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-base font-semibold text-amber-800 transition hover:bg-amber-100 focus:outline-none focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {selectedClient.foto_valida === false
                  ? "Foto marcada para repetir"
                  : isFlaggingPhoto
                    ? "Marcando foto..."
                    : "Marcar foto para repetir"}
              </button>
            </div>

            <form className="space-y-4 px-4 pt-4">
              <div>
                <label
                  htmlFor="customer-audit-name"
                  className="mb-2 block text-sm font-semibold text-slate-600"
                >
                  Nombre
                </label>
                <input
                  id="customer-audit-name"
                  type="text"
                  value={formData.nombre}
                  onChange={(event) => handleFormChange("nombre", event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 p-4 text-lg text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label
                  htmlFor="customer-audit-phone"
                  className="mb-2 block text-sm font-semibold text-slate-600"
                >
                  Telefono
                </label>
                <input
                  id="customer-audit-phone"
                  type="tel"
                  inputMode="tel"
                  value={formData.telefono}
                  onChange={(event) =>
                    handleFormChange("telefono", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 p-4 text-lg text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label
                  htmlFor="customer-audit-address"
                  className="mb-2 block text-sm font-semibold text-slate-600"
                >
                  Direccion Habitual
                </label>
                <textarea
                  id="customer-audit-address"
                  rows={4}
                  value={formData.direccionHabitual}
                  onChange={(event) =>
                    handleFormChange("direccionHabitual", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 p-4 text-lg text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label
                  htmlFor="customer-audit-references"
                  className="mb-2 block text-sm font-semibold text-slate-600"
                >
                  Referencias
                </label>
                <textarea
                  id="customer-audit-references"
                  rows={4}
                  value={formData.referencias}
                  onChange={(event) =>
                    handleFormChange("referencias", event.target.value)
                  }
                  className="w-full rounded-2xl border border-slate-200 p-4 text-lg text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>
            </form>

            {modalError ? (
              <div className="px-4 pt-4">
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {modalError}
                </div>
              </div>
            ) : null}
          </div>

          <div
            className="fixed bottom-0 left-0 right-0 z-[60] bg-gray-900 p-4 text-white shadow-[0_-12px_30px_rgba(15,23,42,0.18)]"
            style={{
              bottom: `${keyboardInset}px`,
              paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
            }}
          >
            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={isSaving}
              className="w-full rounded-2xl bg-gray-900 py-4 text-lg font-semibold text-white focus:outline-none focus:ring-4 focus:ring-white/20 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {isSaving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default CustomerDirectoryAudit
