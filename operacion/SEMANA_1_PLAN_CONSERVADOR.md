# Semana 1 - Plan Ejecutable (Conservador)

Proyecto: `polleria-magon-sistema`

## Objetivos medibles
- Continuidad operativa: >=98% de pedidos completan flujo sin intervencion manual en DB.
- Conciliacion diaria: cumplir umbral en al menos 4 de 5 dias.
- Cierre puntual: cierre operativo antes de 19:00 en al menos 4 de 5 dias.
- Calidad de datos maestros: 100% de SKUs activos con unidad/categoria/stock inicial validado.
- Incidentes criticos: 0 incidentes bloqueantes abiertos al cierre del viernes.

## Umbral oficial de conciliacion
- Regla: `<=3% o <=5 piezas (el mas estricto)`.
- Formula por SKU/dia: `tolerancia = min(3% del movimiento diario, 5 piezas)`.

## Agenda Lun-Vie
### Lunes
- Validar SKUs, unidades y stock inicial.
- Ejecutar baseline de seguridad/contratos con scripts readonly (`22` y `24`).
- Publicar tablero semanal manual (pedidos, cobrado, pendiente, merma, diferencia cierre).

### Martes
- Correr smoke operativo manual: mostrador, domicilio, entrega, inventario.
- Registrar fricciones por paso y tiempos.
- Definir contingencias operativas (push, impresion, sesion admin).

### Miercoles
- Estandarizar corte medio turno y cierre diario.
- Validar consistencia entre Pedidos, Inventario y Contabilidad.
- Clasificar incidencias por severidad.

### Jueves
- Auditar flujo domicilio (`en_preparacion -> en_camino -> entregado`).
- Revisar uso de reapertura/cierre inventario y escalamiento admin.
- Simular 2 escenarios de excepcion (latencia alta, push parcial).

### Viernes
- Consolidar KPIs Lun-Vie vs metas.
- Revisar bloqueantes abiertos y costo operativo.
- Emitir acta GO/NO-GO semana 1 -> semana 2.

## Roles sugeridos
- Operacion: ejecucion diaria y evidencia.
- Dev: soporte, validaciones SQL readonly, correccion de bloqueantes.
- Owner: priorizacion y decision GO/NO-GO.

## Gate semanal GO/NO-GO
GO si se cumple todo:
- 4 de 5 objetivos semanales en verde (incluye continuidad + reportes).
- Sin incidentes criticos abiertos >24h.
- Sin hallazgos criticos nuevos en checks readonly.

NO-GO si ocurre alguno:
- Menos de 4 dias con conciliacion en umbral.
- Diferencias de cierre fuera de umbral en >=2 dias.
- Incidentes recurrentes de flujo critico sin contencion.
