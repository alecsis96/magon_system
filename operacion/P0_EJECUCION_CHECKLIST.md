# P0 - Ejecucion Checklist (0-2 semanas)

Este checklist ejecuta el backlog P0 con evidencia y gate semanal.

## Estado real verificado en repo (Semana 1 - arranque)
- [x] CI gates minimos presentes en `.github/workflows/quality-gates.yml` (lint + typecheck para `admin-web` y `app-repartidor`).
- [x] Scripts de typecheck presentes en `admin-web/package.json` y `app-repartidor/package.json`.
- [x] Saneamiento de secretos en working tree: archivos sensibles removidos (`contraseña supabase.txt`, `app-repartidor/repartidor-magon-firebase-adminsdk-fbsvc-b20c4e4a6a.json`) y patrones de bloqueo en `.gitignore` (`*supabase*.txt`, `*password*.txt`, `*contrase*.txt`, `*firebase-adminsdk*.json`, `*service-account*.json`).

## P0-01 Baseline esquema y RPC
- [x] Exportar firmas actuales de RPC criticas (baseline documental en repo).
- [ ] Validar `24_tanda2_rpc_verificacion_readonly.sql` en PASS.
- [x] Publicar matriz RPC usada vs firma real (`operacion/P0_01_MATRIZ_RPC_BASELINE.md`).

## P0-02 Hardening final de permisos
- [ ] Ejecutar `22_tanda1_verificacion_readonly.sql`.
- [ ] Confirmar minimo privilegio en tablas/policies sensibles.
- [ ] Ejecutar smoke 4/4 post-ajustes en PASS.

## P0-03 Rutina diaria PASS/FAIL
- [ ] Correr `operacion/TABLERO_KPI_SQL.sql` diario.
- [ ] Adjuntar evidencia en `operacion/REPORTE_DIARIO_OPERACION_TEMPLATE.md`.
- [ ] Abrir incidente ante cualquier FAIL.

## P0-04 Playbook incidentes
- [ ] Ejecutar 2 simulacros (falla push y drift RPC).
- [ ] Validar kill-switch y tiempos de respuesta.
- [ ] Registrar lecciones y acciones preventivas.

## P0-05 Cierre y conciliacion
- [ ] Cumplir umbral `<=3% o <=5 piezas` (mas estricto) en 4/5 dias.
- [ ] Cierre antes de 19:00 en 4/5 dias.
- [ ] Cualquier desvio con causa y owner.

## P0-06 Baseline KPI + GO/NO-GO semanal
- [ ] Publicar baseline semanal.
- [ ] Completar `operacion/SEGUIMIENTO_SEMANAL_OWNER_TEMPLATE.md`.
- [ ] Acta GO/NO-GO firmada por Owner/Dev/Operacion.

## Criterio de cierre P0
- [ ] 6/6 tickets P0 en estado Hecho.
- [ ] 0 incidentes criticos abiertos >24h.
- [ ] 2 semanas consecutivas con rutina diaria >=95% cumplimiento.
