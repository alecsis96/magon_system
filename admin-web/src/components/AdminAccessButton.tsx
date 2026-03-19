import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { getAdminAccess, type AdminAccess } from "../lib/admin"
import { supabase } from "../lib/supabase"

const DEFAULT_ACCESS: AdminAccess = {
  isAuthenticated: false,
  isAdmin: false,
  email: null,
}

interface AdminAccessButtonProps {
  className?: string
  panelClassName?: string
}

export function AdminAccessButton({
  className,
  panelClassName,
}: AdminAccessButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [access, setAccess] = useState<AdminAccess>(DEFAULT_ACCESS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function refreshAccess() {
    try {
      setIsLoading(true)
      const nextAccess = await getAdminAccess()
      setAccess(nextAccess)
    } catch (error) {
      console.error("Error al validar acceso admin:", error)
      setAccess(DEFAULT_ACCESS)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshAccess()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshAccess()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function handleLogin() {
    if (!email.trim() || !password) {
      toast.error("Captura correo y contrasena")
      return
    }

    try {
      setIsSubmitting(true)

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        throw error
      }

      await refreshAccess()
      setPassword("")
      toast.success("Sesion de administrador iniciada")
    } catch (error) {
      console.error("Error al iniciar sesion admin:", error)
      toast.error("No se pudo iniciar sesion")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleLogout() {
    try {
      setIsSubmitting(true)

      const { error } = await supabase.auth.signOut()

      if (error) {
        throw error
      }

      setAccess(DEFAULT_ACCESS)
      setPassword("")
      setIsOpen(false)
      toast.success("Sesion cerrada")
    } catch (error) {
      console.error("Error al cerrar sesion admin:", error)
      toast.error("No se pudo cerrar sesion")
    } finally {
      setIsSubmitting(false)
    }
  }

  const buttonLabel = access.isAdmin
    ? "Admin Activo"
    : access.isAuthenticated
      ? "Sesion Abierta"
      : "Admin"

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`${className ?? "rounded-full px-5 py-3"} z-40 text-sm font-black shadow-[0_18px_40px_rgba(15,23,42,0.22)] transition focus:outline-none focus:ring-4 ${
          access.isAdmin
            ? "bg-emerald-600 text-white focus:ring-emerald-200"
            : "bg-slate-900 text-white focus:ring-slate-300"
        }`}
      >
        {isLoading ? "Validando..." : buttonLabel}
      </button>

      {isOpen ? (
        <div
          className={`${panelClassName ?? "absolute right-0 top-[calc(100%+0.75rem)] w-[min(92vw,24rem)]"} z-40 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Acceso Admin
              </p>
              <h3 className="mt-2 text-2xl font-black text-slate-900">
                {access.isAuthenticated ? "Sesion administrativa" : "Iniciar sesion"}
              </h3>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full px-3 py-1 text-sm font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              Cerrar
            </button>
          </div>

          {access.isAuthenticated ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Cuenta actual
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {access.email ?? "Sin correo"}
                </p>
                <p
                  className={`mt-3 text-sm font-semibold ${
                    access.isAdmin ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {access.isAdmin
                    ? "Permisos de administrador verificados"
                    : "Sesion iniciada, pero sin permisos de administrador"}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void refreshAccess()}
                  disabled={isSubmitting}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Actualizar estado
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={isSubmitting}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  {isSubmitting ? "Saliendo..." : "Cerrar sesion"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="admin-email"
                  className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                >
                  Correo
                </label>
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                >
                  Contrasena
                </label>
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-base font-semibold text-slate-900 outline-none transition focus:border-slate-400"
                />
              </div>

              <button
                type="button"
                onClick={() => void handleLogin()}
                disabled={isSubmitting}
                className="w-full rounded-3xl bg-slate-900 px-6 py-4 text-sm font-black text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
              >
                {isSubmitting ? "Entrando..." : "Entrar como admin"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}

export default AdminAccessButton
