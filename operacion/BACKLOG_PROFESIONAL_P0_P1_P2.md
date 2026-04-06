# Backlog Profesional P0/P1/P2

Proyecto: `polleria-magon-sistema`
Horizonte: 12 semanas

## P0 (0-2 semanas)

### P0-01 - Baseline de esquema y RPC sin drift
- Objetivo: eliminar deriva frontend/DB.
- Alcance: inventario de RPC usadas, snapshot de firmas, gate de compatibilidad.
- No alcance: refactor funcional.
- Dependencias: acceso Supabase lectura.
- Esfuerzo: M
- Riesgo: Alto
- Owner: Dev
- Aceptacion:
  - Matriz RPC publicada y aprobada.
  - Verificacion contratos 100% verde.
  - Gate release activo.
- KPI: incidentes por contrato roto = 0/semana.

### P0-02 - Hardening final de permisos sensibles
- Objetivo: minimo privilegio real.
- Alcance: ajuste policies/grants en clientes/tokens/storage.
- No alcance: rediseno IAM completo.
- Dependencias: P0-01.
- Esfuerzo: M
- Riesgo: Alto
- Owner: Dev
- Aceptacion:
  - Matriz antes/despues aprobada por owner.
  - Checks Tanda 1 verdes.
  - Smoke 4/4 verde tras cambio.
- KPI: hallazgos criticos seguridad = 0.

### P0-03 - Rutina diaria PASS/FAIL unificada
- Objetivo: control operativo trazable diario.
- Alcance: ejecutar KPI+Tanda1+Tanda2 con evidencia y estado.
- No alcance: BI avanzado.
- Dependencias: P0-01.
- Esfuerzo: S
- Riesgo: Medio
- Owner: Operacion
- Aceptacion:
  - 10/10 dias con reporte diario.
  - Todo FAIL con ticket de incidente.
- KPI: cumplimiento rutina >=95%.

### P0-04 - Playbook incidentes + kill switch
- Objetivo: bajar tiempo de reaccion.
- Alcance: severidad, SLA, escalamiento, contencion y rollback.
- No alcance: ITSM enterprise.
- Dependencias: ninguna.
- Esfuerzo: S
- Riesgo: Medio
- Owner: Owner
- Aceptacion:
  - Playbook aprobado.
  - 2 simulacros ejecutados.
- KPI: MTTA <15 min en incidentes criticos.

### P0-05 - Disciplina de cierre y conciliacion
- Objetivo: estabilizar diferencia de cierre.
- Alcance: checklist apertura/medio turno/cierre + umbral oficial.
- No alcance: forecasting.
- Dependencias: P0-03.
- Esfuerzo: M
- Riesgo: Alto
- Owner: Operacion
- Aceptacion:
  - 4/5 dias dentro de umbral `<=3% o <=5 piezas`.
  - Cierre antes de 19:00 en 4/5 dias.
- KPI: desvio fuera de umbral <=1 dia/semana.

### P0-06 - Baseline KPI semanal y decision GO/NO-GO
- Objetivo: decisiones semanales sustentadas en datos.
- Alcance: baseline oficial (cobrado, pendiente, merma, cierre, incidentes) + ritual semanal.
- No alcance: analitica predictiva.
- Dependencias: P0-03, P0-05.
- Esfuerzo: S
- Riesgo: Medio
- Owner: Owner
- Aceptacion:
  - Baseline aprobado.
  - 2 reportes semanales consecutivos emitidos.
  - Acta GO/NO-GO semanal con evidencia.
- KPI: 100% decisiones semanales con soporte KPI.

## P1 (3-6 semanas)

### P1-01 - QA contractual + smoke E2E pre-release
- Objetivo: reducir escapes a produccion.
- Alcance: smoke automatizado de flujo critico + validacion contratos.
- Dependencias: P0-01, P0-02.
- Esfuerzo: L
- Riesgo: Alto
- Owner: Dev
- Aceptacion: no release sin smoke verde + contratos compatibles.
- KPI: fallos criticos post-release -50%.

### P1-02 - Observabilidad operativa minima
- Objetivo: detectar fallas temprano.
- Alcance: logging estructurado + alertas basicas.
- Dependencias: P0-04.
- Esfuerzo: M
- Riesgo: Medio
- Owner: Dev
- Aceptacion: eventos criticos logueados + alertas activas.
- KPI: MTTD <10 min.

### P1-03 - Cobranza con aging y rutina semanal
- Objetivo: mejorar flujo de caja.
- Alcance: seguimiento 0-1/2-3/4+ dias y escalamiento.
- Dependencias: P0-06
- Esfuerzo: M
- Riesgo: Medio
- Owner: Operacion
- Aceptacion: SOP 5/5 dias por 3 semanas.
- KPI: bucket 4+ dias -25%.

### P1-04 - Flujo repartidor robusto
- Objetivo: reducir friccion de ultima milla.
- Alcance: captura/entrega con manejo robusto de errores.
- Dependencias: P0-02, P1-02.
- Esfuerzo: M
- Riesgo: Medio
- Owner: Dev
- Aceptacion: 20 pedidos de prueba sin bloqueo.
- KPI: entregas sin intervencion manual >=98%.

### P1-05 - Gobernanza de migraciones SQL
- Objetivo: evitar drift y despliegues riesgosos.
- Alcance: flujo versionado de cambios DB + checklist pre/post.
- Dependencias: P0-01.
- Esfuerzo: M
- Riesgo: Alto
- Owner: Dev
- Aceptacion: 100% cambios DB por flujo versionado.
- KPI: incidentes por migracion fallida = 0.

## P2 (7-12 semanas)

### P2-01 - Forecast basico de demanda
- Objetivo: reducir merma por sobreproduccion.
- Owner: Owner
- Esfuerzo: L
- KPI: merma -15% adicional.

### P2-02 - KPI por turno y rol
- Objetivo: mejorar productividad operativa.
- Owner: Owner
- Esfuerzo: M
- KPI: tiempo medio de cierre -20%.

### P2-03 - Resiliencia de despacho con fallback
- Objetivo: sostener despacho ante fallas push.
- Owner: Dev
- Esfuerzo: M
- KPI: pedidos no despachados por fallo notificacion <1%.

### P2-04 - Auditoria mensual y plan trimestral
- Objetivo: institucionalizar mejora continua.
- Owner: Owner
- Esfuerzo: S
- KPI: >=90% hallazgos criticos cerrados en 30 dias.

## Orden recomendado por olas
- Ola 1 (sem 1-2): P0 completo.
- Ola 2 (sem 3-6): P1 con foco en QA/observabilidad/migraciones.
- Ola 3 (sem 7-12): P2 para escalar con disciplina.
