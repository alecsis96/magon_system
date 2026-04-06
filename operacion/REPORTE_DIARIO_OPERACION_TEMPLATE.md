# REPORTE DIARIO DE OPERACION

> Plantilla de cierre diario para Operacion, Dev y Owner. Completar todos los campos al cierre de turno.

## 1) Datos del cierre

- Fecha: `____/____/______`
- Dia de semana: `______________`
- Turno: `Manana / Tarde / Noche`
- Hora de apertura: `__:__`
- Hora de cierre: `__:__`
- Responsable Operacion: `________________________`
- Responsable Dev (si aplica): `________________________`
- Owner / Responsable de decision: `________________________`

## 2) Resumen del turno

### Estado general (1-3 lineas)

`______________________________________________________________________________`

`______________________________________________________________________________`

`______________________________________________________________________________`

### Hechos relevantes del dia

- `___________________________________________________________________________`
- `___________________________________________________________________________`
- `___________________________________________________________________________`

## 3) KPIs del dia (cierre financiero y operativo)

> Completar con los montos finales del dia. Usar la misma fuente para todos los calculos.

| KPI | Valor del dia | Fuente | Estado (OK / Revisar) | Observaciones |
|---|---:|---|---|---|
| Facturado total | `$ __________` | `SQL / UI / Caja` | `__________` | `________________________` |
| Cobrado total | `$ __________` | `SQL / UI / Caja` | `__________` | `________________________` |
| Pendiente por cobrar | `$ __________` | `SQL / UI / Caja` | `__________` | `________________________` |
| Merma del dia | `$ __________` | `SQL / UI / Caja` | `__________` | `________________________` |
| Diferencia de cierre (caja vs sistema) | `$ __________` | `SQL / UI / Caja` | `__________` | `________________________` |

### Alertas de KPI

- [ ] No hay alertas
- [ ] Pendiente por cobrar por encima del umbral diario
- [ ] Merma por encima del umbral diario
- [ ] Diferencia de cierre distinta de cero
- [ ] Otro: `_______________________________________________________________`

## 4) Incidentes del dia

> Registrar incidentes operativos, tecnicos o de datos. Uno por fila.

| Hora | Tipo (Operacion / Sistema / Datos / Caja) | Descripcion breve | Impacto (Bajo / Medio / Alto) | Estado (Abierto / Mitigado / Resuelto) | Responsable |
|---|---|---|---|---|---|
| `__:__` | `______________` | `____________________________` | `________` | `________` | `______________` |
| `__:__` | `______________` | `____________________________` | `________` | `________` | `______________` |
| `__:__` | `______________` | `____________________________` | `________` | `________` | `______________` |

## 5) Acciones correctivas ejecutadas

> Acciones realizadas hoy para corregir desvio o reducir riesgo.

| Accion | Motivo | Responsable | Hora de ejecucion | Resultado |
|---|---|---|---|---|
| `________________________` | `________________________` | `________________` | `__:__` | `________________________` |
| `________________________` | `________________________` | `________________` | `__:__` | `________________________` |
| `________________________` | `________________________` | `________________` | `__:__` | `________________________` |

## 6) Riesgos para el proximo dia

> Incluir riesgos no resueltos o nuevos riesgos detectados en el cierre.

| Riesgo | Probabilidad (Baja / Media / Alta) | Impacto (Bajo / Medio / Alto) | Plan de mitigacion | Responsable | Fecha objetivo |
|---|---|---|---|---|---|
| `________________________` | `________` | `________` | `________________________` | `________________` | `____/____/______` |
| `________________________` | `________` | `________` | `________________________` | `________________` | `____/____/______` |
| `________________________` | `________` | `________` | `________________________` | `________________` | `____/____/______` |

## 7) Decision diaria

> Marcar una sola opcion y justificar en una linea.

- [ ] **Seguir**: operacion normal, sin bloqueantes criticos.
- [ ] **Contener**: operar con restricciones y seguimiento reforzado.
- [ ] **Escalar**: elevar a Owner/Dev por riesgo alto o bloqueo critico.

Justificacion de la decision:

`______________________________________________________________________________`

`______________________________________________________________________________`

## 8) Checklist de evidencia adjunta (obligatorio)

> Adjuntar capturas y referencias para auditoria del cierre diario.

### Evidencia SQL

- [ ] Captura de consulta de **facturado total**
- [ ] Captura de consulta de **cobrado total**
- [ ] Captura de consulta de **pendiente por cobrar**
- [ ] Captura de consulta de **merma**
- [ ] Captura de consulta de **diferencia de cierre**
- [ ] Archivo SQL o texto de consultas utilizadas

### Evidencia UI

- [ ] Captura del panel/resumen de ventas del dia
- [ ] Captura del estado de cobranzas
- [ ] Captura del registro de mermas
- [ ] Captura de cierre de caja / arqueo
- [ ] Captura de incidentes (si hubo)

### Referencias de adjuntos

- Carpeta o ruta de evidencias: `______________________________________________`
- Nombre de archivos adjuntos: `______________________________________________`

## 9) Cierre y firmas

- Operacion (nombre y firma): `______________________________________________`
- Dev (nombre y firma, si aplica): `__________________________________________`
- Owner (nombre y firma / aprobacion): `______________________________________`
- Hora de envio del reporte: `__:__`

---

## Criterio minimo para considerar el cierre completo

- [ ] Todos los KPI completados con fuente
- [ ] Incidentes registrados (o se deja constancia de "sin incidentes")
- [ ] Acciones correctivas registradas (o "no aplica")
- [ ] Riesgos para el proximo dia evaluados
- [ ] Decision diaria marcada y justificada
- [ ] Evidencia SQL y UI adjunta
- [ ] Firmas y hora de envio completadas
