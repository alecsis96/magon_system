# Plan de Despliegue Seguro por Olas

Proyecto: `polleria-magon-sistema`

## Ola 1 - Contencion y estabilidad critica (Semana 1)
### Precondiciones
- Backup verificado y punto de recuperacion documentado.
- Ventana de cambio en turno de menor demanda.
- On-call activo (Operacion + Dev + Owner).
- Scripts listos: `operacion/TABLERO_KPI_SQL.sql`, `22_tanda1_verificacion_readonly.sql`, `24_tanda2_rpc_verificacion_readonly.sql`.

### Pruebas obligatorias
- KPI diario en PASS.
- Verificacion Tanda 1 en PASS.
- Registro de evidencia SQL+UI.

### Gate salida Ola 1 -> Ola 2
- PASS diario 5/5.
- 0 incidentes criticos >24h.
- Conciliacion dentro de umbral en >=4/5 dias.

## Ola 2 - Integridad contratos y flujo E2E (Semana 2)
### Precondiciones
- Gates Ola 1 cumplidos.
- Matriz RPC usada vs firma real aprobada.
- Casos smoke definidos y asignados.

### Pruebas obligatorias
- Verificacion Tanda 2 en PASS.
- Smoke 4/4: mostrador, domicilio, entrega, inventario.
- Re-ejecucion post despliegue.

### Gate salida Ola 2 -> Ola 3
- RPC 100% compatibles.
- Smoke 4/4 verde por 3 dias consecutivos.
- Sin inconsistencias criticas de cierre.

## Ola 3 - Escalado total y normalizacion (Semana 3)
### Precondiciones
- Gates Ola 2 cumplidos.
- Aprobacion formal Owner + Dev + Operacion.

### Pruebas obligatorias
- Todo lo de Ola 2.
- Verificacion en 2 cortes diarios (medio turno + cierre).

### Estabilizacion final
- 7 dias sin activar kill criteria.
- KPI semanales dentro de objetivo.

## Kill criteria (STOP inmediato)
- Ventas bloqueadas >10 min.
- 5xx >5% sostenido.
- Inconsistencia critica sin correccion inmediata.
- Drift RPC que rompa cobro/entrega.
- Diferencia cierre fuera de umbral en 2 cortes seguidos.
- Incidente de seguridad (permisos mas abiertos que lo aprobado).

## Rollback
1. Congelar cambios y declarar incidente.
2. Volver a version estable previa.
3. Re-ejecutar scripts de verificacion.
4. Comunicar estado y ETA cada 30 min.
5. Cerrar incidente solo con 2 corridas PASS consecutivas.

## Runbook de comunicacion
### Diario
- Pre-apertura: riesgos, cambios, responsables.
- Durante ventana: reporte cada 30 min (fase, semaforo, checks, riesgos, decision).
- Cierre: completar `operacion/REPORTE_DIARIO_OPERACION_TEMPLATE.md`.

### Semanal
- Viernes: comite GO/NO-GO con template owner.
- Publicar acta con decision, condiciones y riesgos remanentes.

## Matriz de riesgo
| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Drift RPC | Media | Alto | Verificacion Tanda 2 + gate compatibilidad |
| Policies mal aplicadas | Media | Alto | Verificacion Tanda 1 diaria |
| Descuadre inventario | Media | Alto | Conciliacion 2 cortes + escalamiento |
| Falla flujo critico | Media | Alto | Smoke 4/4 pre/post deploy |
| Falla push | Media | Medio-Alto | Fallback operativo + health checks |
