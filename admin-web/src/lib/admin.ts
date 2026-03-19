import { supabase } from "./supabase"

export type AdminAccess = {
  isAuthenticated: boolean
  isAdmin: boolean
  email: string | null
}

export async function getAdminAccess(): Promise<AdminAccess> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }

  if (!user) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      email: null,
    }
  }

  const { data, error } = await (supabase as typeof supabase & {
    rpc: (fn: "es_usuario_admin") => Promise<{
      data: boolean | null
      error: Error | null
    }>
  }).rpc("es_usuario_admin")

  if (error) {
    throw error
  }

  return {
    isAuthenticated: true,
    isAdmin: Boolean(data),
    email: user.email ?? null,
  }
}
