# Semana 1 - Tablero de Ejecucion (Conservador)

Proyecto: `polleria-magon-sistema`
Semana operativa: `Lun-Vie`

## Tablero diario ejecutable

Estados permitidos: `Pendiente` | `En curso` | `Hecho`

| Dia | Tarea | Owner | Evidencia (completar) | Estado | Bloqueo |
|---|---|---|---|---|---|
| Lunes | Validar 100% de SKUs activos con unidad, categoria y stock inicial antes de abrir caja. | Operacion | Checklist firmado + export de SKUs validados + hora de cierre de validacion. | Pendiente | Ninguno |
| Lunes | Ejecutar baseline readonly de seguridad/contratos con scripts `22` y `24`. | Dev | Salida de ejecucion de scripts + observaciones (OK/Hallazgo) en bitacora del dia. | Pendiente | Ninguno |
| Lunes | Publicar tablero manual diario (pedidos, cobrado, pendiente, merma, diferencia cierre) antes de 11:00. | Operacion | Captura/tablero compartido con 5 metricas visibles y timestamp. | En curso | Ninguno |
| Martes | Correr smoke operativo completo: mostrador -> domicilio -> entrega -> impacto inventario. | Operacion | 3 pedidos de prueba documentados (1 mostrador, 1 domicilio, 1 mixto) con resultado final. | Pendiente | Ninguno |
| Martes | Registrar fricciones por paso y tiempos reales (inicio/fin por etapa). | Operacion | Log con tiempos por paso y top 3 fricciones con severidad preliminar. | Pendiente | Ninguno |
| Martes | Definir contingencias para push, impresion y sesion admin (quien decide y en cuanto tiempo). | Owner | Minuta operativa con responsables, SLA y canal de escalamiento. | Pendiente | Ninguno |
| Miercoles | Ejecutar corte de medio turno y cierre diario con checklist unico. | Operacion | Checklist de medio turno + checklist de cierre con firma y hora (<19:00 objetivo). | Pendiente | Ninguno |
| Miercoles | Validar consistencia Pedidos vs Inventario vs Contabilidad. | Dev | Consulta de conciliacion diaria por SKU + delta detectado (si aplica). | Pendiente | Ninguno |
| Miercoles | Clasificar incidencias abiertas por severidad y definir owner por ticket. | Owner | Tabla de incidencias con severidad (`Critica/Alta/Media/Baja`) y responsable asignado. | Pendiente | Ninguno |
| Jueves | Auditar flujo domicilio `en_preparacion -> en_camino -> entregado` sobre casos reales. | Operacion | Muestra de pedidos domicilio auditados con transicion de estados y tiempos. | Pendiente | Ninguno |
| Jueves | Revisar uso de reapertura/cierre de inventario y escalamiento admin en el dia. | Dev | Registro de reaperturas/cierres + motivo + aprobador admin. | Pendiente | Ninguno |
| Jueves | Simular 2 excepciones: latencia alta y push parcial; validar plan de contencion. | Dev | Resultado de simulaciones + tiempo de recuperacion + decision tomada. | Pendiente | Ninguno |
| Viernes | Consolidar KPIs Lun-Vie contra metas semanales (continuidad, conciliacion, cierre, calidad de datos, incidentes). | Operacion | Resumen KPI semanal con semaforo por objetivo y soporte numerico. | Pendiente | Ninguno |
| Viernes | Revisar bloqueantes abiertos y costo operativo de mitigaciones de la semana. | Dev | Lista de bloqueantes (estado/edad) + costo operativo estimado por incidencia. | Pendiente | Ninguno |
| Viernes | Emitir acta de decision Semana 1 -> Semana 2 (GO o NO-GO). | Owner | Acta firmada con decision final, riesgos remanentes y plan inmediato. | Pendiente | Ninguno |

## Regla semanal GO/NO-GO + umbral oficial de conciliacion

Umbral oficial (obligatorio por SKU/dia):
- `<=3% o <=5 piezas`, aplicando siempre el mas estricto.
- Formula operativa: `tolerancia = min(3% del movimiento diario del SKU, 5 piezas)`.

Decision `GO` a Semana 2 solo si se cumple TODO:
- Minimo `4 de 5` objetivos semanales en verde.
- Minimo `4 de 5` dias con conciliacion dentro de umbral oficial.
- `0` incidentes criticos abiertos por mas de `24h` al cierre del viernes.
- Sin hallazgos criticos nuevos en checks readonly.

Decision `NO-GO` si ocurre CUALQUIERA:
- Menos de `4` dias con conciliacion en umbral.
- Diferencias de cierre fuera de umbral en `2` o mas dias.
- Incidentes recurrentes en flujo critico sin contencion efectiva.
