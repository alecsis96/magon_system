# Auditoria Profesional del Sistema

Proyecto: `polleria-magon-sistema`
Fecha: 2026-04-06
Modo: solo lectura para evaluacion, con validaciones runtime compartidas por el owner.

## Resumen ejecutivo
- El sistema es operable y ya paso gates clave de contratos RPC/permisos (`authenticated=true`, `anon=false`).
- Persisten riesgos estructurales: secretos en repo, modulos monoliticos, ausencia de CI/testing robusto, trazabilidad incompleta.
- La base de inventario/ventas es buena, pero hay deuda en consistencia de reglas UI vs RPC y en gobernanza de datos.
- Se recomienda ejecucion conservadora por olas: riesgo primero, luego calidad y escalabilidad.

## Hallazgos criticos y altos

### Critico
- Secreto sensible en repo: `app-repartidor/repartidor-magon-firebase-adminsdk-fbsvc-b20c4e4a6a.json`.

### Alto
- Policies aun amplias en rutas sensibles (`10_app_repartidor_policies.sql`, `11_clientes_insert_policy.sql`, `07_storage_fachadas_policies.sql`).
- Archivos monoliticos con mezcla UI + negocio + datos:
  - `admin-web/src/App.tsx`
  - `admin-web/src/components/InventoryManager.tsx`
  - `app-repartidor/app/(tabs)/index.tsx`
- Casi sin red automatica de calidad (tests/CI) en `admin-web/package.json` y `app-repartidor/package.json`.
- Riesgo de perdida historica por borrados fisicos/cascada (`15_clientes_delete_cascade.sql`, `16_clientes_delete_admin_rpc.sql`).

## Controles que ya funcionan
- Hardening de endpoint push en `admin-web/api/expo-push.js`.
- Scripts de verificacion operativa:
  - `22_tanda1_verificacion_readonly.sql`
  - `24_tanda2_rpc_verificacion_readonly.sql`
- Tokens push validos (segun evidencia runtime del owner).

## Recomendaciones por tipo
- Implementar: CI minima + tests de flujo critico + bitacora de eventos de pedido.
- Corregir: inconsistencias de reglas inventario/checkout y transiciones de estado.
- Reemplazar: borrado fisico por soft-delete con motivo/actor/timestamp.
- Anadir: capa semantica de reporting (views/materializadas) y gobernanza KPI.

## Roadmap 30/60/90
- 30 dias: cerrar P0 seguridad/consistencia + quality gates minimos.
- 60 dias: modularizacion incremental y contratos tipados estables.
- 90 dias: observabilidad operativa y madurez de datos/reporting.
