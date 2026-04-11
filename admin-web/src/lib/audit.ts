import { supabase } from "./supabase"
import type { AuditoriaModulo, Json } from "../types/database"

type RegistrarEventoAuditoriaInput = {
  modulo: AuditoriaModulo
  accion: string
  entidad: string
  entidadId?: string | null
  detalle?: Json
}

export async function registrarEventoAuditoria(input: RegistrarEventoAuditoriaInput) {
  const { error } = await supabase.rpc("registrar_evento_auditoria", {
    p_modulo: input.modulo,
    p_accion: input.accion,
    p_entidad: input.entidad,
    p_entidad_id: input.entidadId ?? null,
    p_detalle: input.detalle ?? {},
  })

  if (error) {
    throw error
  }
}

export async function registrarEventoAuditoriaBestEffort(
  input: RegistrarEventoAuditoriaInput,
) {
  try {
    await registrarEventoAuditoria(input)
  } catch (error) {
    console.warn("No se pudo registrar evento de auditoria:", error, input)
  }
}
