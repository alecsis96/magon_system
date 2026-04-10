# Acta Semanal W1 - GO/NO-GO

Proyecto: `polleria-magon-sistema`
Semana: `W1`
Periodo: `Pendiente de completar (Lun-Vie)`
Fecha de corte: `Pendiente`
Owner: `Pendiente`

## 1) Estado inicial Semana 1
- Semaforo general: `AMARILLO` (arranque en curso)
- Decision actual: `PENDIENTE` (todavia no corresponde definir GO/NO-GO final)
- Avance verificado en repo:
  - CI gates minimos presentes: workflow `quality-gates.yml` con `lint` y `typecheck` para `admin-web` y `app-repartidor`.
  - Scripts `typecheck` presentes en ambos `package.json`.
  - Saneamiento de secretos visible en working tree: archivo sensible removido y patrones de bloqueo en `.gitignore`.
  - P0-01: matriz baseline de RPC criticas publicada en `operacion/P0_01_MATRIZ_RPC_BASELINE.md` (inventario de uso frontend + firma esperada por SQL/tipos versionados).
- Pendientes criticos para cierre W1:
  - Ejecutar rutina diaria de evidencia operativa (PASS/FAIL) con soporte en reportes.
  - Correr validaciones readonly y smoke operativo con evidencia de resultados.
  - Consolidar KPIs Lun-Vie contra umbral oficial de conciliacion.

## 2) Criterios de decision W1 -> W2
`GO` solo si se verifica todo al cierre de semana:
- Minimo `4/5` objetivos semanales en verde.
- Minimo `4/5` dias con conciliacion dentro de `<=3% o <=5 piezas` (el mas estricto).
- `0` incidentes criticos abiertos por mas de `24h`.
- Sin hallazgos criticos nuevos en checks readonly.

`NO-GO` si ocurre cualquiera:
- Menos de `4` dias con conciliacion en umbral.
- Diferencias de cierre fuera de umbral en `2` o mas dias.
- Incidentes recurrentes en flujo critico sin contencion efectiva.

## 3) Riesgos abiertos (bloque obligatorio)
| ID | Riesgo abierto | Probabilidad | Impacto | Mitigacion propuesta | Owner requerido | Estado |
|---|---|---|---|---|---|---|
| R-01 | Falta de evidencia diaria completa para sustentar decision GO/NO-GO. | Media | Alta | Forzar cierre diario con `REPORTE_DIARIO_OPERACION_TEMPLATE.md` antes de fin de jornada. | Operacion | Abierto |
| R-02 | Desvio de conciliacion sin accion correctiva dentro del mismo dia. | Media | Alta | Ejecutar alerta y escalamiento inmediato ante FAIL de umbral oficial por SKU/dia. | Owner + Dev | Abierto |
| R-03 | Hallazgos en validaciones readonly sin priorizacion explicita para semana siguiente. | Baja/Media | Alta | Registrar hallazgo, severidad y fecha compromiso en backlog operativo semanal. | Owner | Abierto |

## 4) Decisiones requeridas del owner (bloque obligatorio)
| ID | Decision requerida | Opciones | Recomendacion tecnica | Fecha limite |
|---|---|---|---|---|
| D-01 | Politica ante desvio de conciliacion en dia 1-2 (continuar vs frenar despliegue). | A) Continuar con mitigacion, B) Congelar avance a W2 hasta normalizar, C) Excepcion por owner. | B) Congelar avance a W2 si hay >=2 dias fuera de umbral para proteger operacion. | Viernes W1 |
| D-02 | SLA de respuesta ante incidente critico operativo. | A) 30 min, B) 60 min, C) 120 min. | A) 30 min para contencion inicial en flujo critico. | Martes W1 |
| D-03 | Criterio de firma final de acta (quien puede vetar GO). | A) Solo Owner, B) Owner+Dev, C) Owner+Dev+Operacion. | C) Firma tripartita para trazabilidad y responsabilidad compartida. | Viernes W1 |

## 5) Proxima actualizacion del acta
- Actualizar este documento al cierre de cada dia con evidencia y semaforo.
- Completar decision final `GO` o `NO-GO` el viernes con firmas de Owner, Dev y Operacion.
