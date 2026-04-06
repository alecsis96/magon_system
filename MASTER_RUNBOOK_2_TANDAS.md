# Master Runbook 2 Tandas

Este documento baja a ejecucion el plan acordado: primero seguridad/estabilidad critica (Tanda 1), despues contratos y calidad operacional (Tanda 2).

## Tanda 1 (Seguridad Critica)

### Objetivo
- Reducir riesgo inmediato sin frenar operacion: secretos, RLS, storage y push auth.

### Orden de ejecucion
1. Rotar secretos expuestos y propagar nuevos valores.
2. Aplicar hardening RLS en `clientes` y `repartidor_push_tokens`.
3. Aplicar hardening en storage bucket `fachadas`.
4. Desplegar endpoint push endurecido.
5. Ejecutar checks POST y decidir GO/NO-GO.

### Gates de salida
- No quedan secretos sensibles en git ni activos sin rotar.
- Write publico restringido en datos sensibles.
- Endpoint push rechaza no-admin y payload invalido.
- Flujos criticos siguen operativos (venta, despacho, entrega).

## Tanda 2 (Contratos + Calidad)

### Objetivo
- Cerrar drift frontend/SQL y validar integridad operativa de punta a punta.

### Orden de ejecucion
1. Inventario de RPC usadas por frontend.
2. Introspeccion en DB: existencia y firmas.
3. Resolver drift bloqueante antes de release.
4. Ejecutar smoke suite minima (mostrador, domicilio, entrega, inventario).
5. Ejecutar quality gates minimos (`lint`, `typecheck`, smoke).

### Gates de salida
- Todas las RPC usadas por frontend existen con firma compatible.
- Smoke 4/4 en verde con evidencia.
- Sin inconsistencias criticas en estado de pedidos/inventario.

## Kill Switch
- Parar ejecucion si ventas se bloquean >10 min.
- Parar ejecucion si errores 5xx >5% sostenido.
- Parar ejecucion si se detecta inconsistencia de datos sin rollback inmediato.

## Reporte Operativo (cada 30 min)
- Hora y fase actual.
- Estado: verde/amarillo/rojo.
- Cambios aplicados desde ultimo corte.
- Resultado de checks criticos.
- Riesgos activos y mitigacion.
- Decision: continuar / pausar / rollback.
