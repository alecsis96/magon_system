# GUIA DE EJECUCION SQL DIARIA (SUPABASE)

Documento operativo para ejecutar y validar consultas SQL diarias en Supabase SQL Editor.

## Objetivo diario

- Ejecutar tres scripts en orden.
- Confirmar que el estado operativo, seguridad y contratos RPC siguen sanos.
- Definir rapido si el dia queda en **PASS** o **FAIL**.

## Pre-requisitos (2 minutos)

- Tener acceso al proyecto correcto en Supabase (ambiente productivo).
- Abrir **Supabase -> SQL Editor -> New query**.
- Verificar fecha operativa del dia (`YYYY-MM-DD`) para usarla en el tablero KPI.
- Confirmar que no hay mantenimiento o incidentes abiertos en curso.

## Secuencia recomendada de ejecucion

Ejecutar siempre en este orden:

1. `operacion/TABLERO_KPI_SQL.sql`
2. `22_tanda1_verificacion_readonly.sql`
3. `24_tanda2_rpc_verificacion_readonly.sql`

Razon operativa del orden: primero salud del negocio (KPI), luego seguridad/datos sensibles (Tanda 1), y al final contratos de integracion (RPC).

## Paso a paso en Supabase SQL Editor

## 1) Ejecutar `operacion/TABLERO_KPI_SQL.sql`

### 1.1 Cargar y preparar

- Abrir el archivo `operacion/TABLERO_KPI_SQL.sql`.
- Copiar todo el contenido al editor SQL.
- Reemplazar `:p_fecha` por la fecha operativa (ejemplo: `'2026-04-05'`).
- Ejecutar la consulta completa.

### 1.2 Resultados a revisar (7 bloques)

- **Bloque 1 (facturacion/cobrado/pendiente):** revisar que `pedidos_total`, `facturado_dia`, `cobrado_dia`, `pendiente_dia` sean coherentes para el dia.
- **Bloque 2 (pedidos activos):** confirmar que no aparezcan pedidos antiguos trabados en estado no entregado sin justificacion.
- **Bloque 3 (stock del dia):** validar que exista fila para la fecha y que `stock_final` no sea negativo.
- **Bloque 4 (tasa merma):** controlar `tasa_merma_pct` (alerta operativa si sube por encima del umbral interno).
- **Bloque 5 (conciliacion cierre):** revisar `diferencia_cierre_piezas`; idealmente 0 o dentro de tolerancia definida.
- **Bloque 6 (neto operativo):** validar que `cobrado` y `egresos` tengan sentido; `neto_operativo` muy negativo requiere investigacion.
- **Bloque 7 (aging pendientes):** observar si crece bucket `4+ dias`, indicador de riesgo de cobranza.

### 1.3 Criterio PASS/FAIL para este paso

- **PASS** si: el script corre sin error, hay datos para la fecha (o ausencia justificada), y no hay inconsistencias criticas (stock negativo, conciliacion descontrolada, aging disparado sin causa).
- **FAIL** si: hay error SQL, fecha sin datos inesperadamente, o aparece cualquier inconsistencia critica operativa.

## 2) Ejecutar `22_tanda1_verificacion_readonly.sql`

### 2.1 Cargar y ejecutar

- Abrir `22_tanda1_verificacion_readonly.sql`.
- Copiar y ejecutar completo en una nueva query del SQL Editor.

### 2.2 Resultados a revisar

- **Consulta 1 (pg_policies):** deben existir policies esperadas sobre `public.clientes`, `public.repartidor_push_tokens` y `storage.objects`.
- **Consulta 2 (bucket fachadas):** debe existir bucket `fachadas` y su configuracion no debe diferir de lo aprobado.
- **Consulta 3 (tokens push):** revisar `formato_invalido = 0` y `longitud_invalida = 0`.

### 2.3 Criterio PASS/FAIL para este paso

- **PASS** si: aparecen las policies esperadas, bucket `fachadas` existe correctamente, y no hay tokens invalidos.
- **FAIL** si: faltan policies, bucket no existe/esta mal configurado, o hay `formato_invalido`/`longitud_invalida` mayor a 0.

## 3) Ejecutar `24_tanda2_rpc_verificacion_readonly.sql`

### 3.1 Cargar y ejecutar

- Abrir `24_tanda2_rpc_verificacion_readonly.sql`.
- Copiar y ejecutar completo en una nueva query del SQL Editor.

### 3.2 Resultados a revisar

- **Consulta 1 (existencia RPC):** todas las funciones esperadas deben tener `existe_en_db = true`.
- **Consulta 2 (firma y retorno):** comparar `firma` y `retorno` contra el contrato esperado vigente.
- **Consulta 3 (privilegios EXECUTE):** validar que `authenticated_can_execute` y `anon_can_execute` coincidan con el modelo de permisos definido.

### 3.3 Criterio PASS/FAIL para este paso

- **PASS** si: todas las RPC existen, firmas/retornos coinciden con contrato, y privilegios son los correctos.
- **FAIL** si: falta una RPC, hay drift en firma/retorno, o permisos de ejecucion no corresponden.

## Cierre diario: decision final PASS/FAIL

- **PASS diario**: los 3 pasos quedaron en PASS.
- **FAIL diario**: si al menos 1 paso quedo en FAIL.
- Registrar resultado en bitacora operativa del dia con timestamp, usuario ejecutor y evidencia (capturas o export de resultados).

## Que hacer si falla

## Acciones inmediatas (primeros 15 minutos)

- Guardar evidencia: screenshot o export CSV de la consulta fallida.
- Re-ejecutar UNA vez para descartar error transitorio de editor/sesion.
- Confirmar que se corrio en el proyecto correcto (no staging/dev por error).
- Clasificar el fallo:
  - **Datos operativos/KPI** (tablero)
  - **Seguridad/RLS/storage** (tanda 1)
  - **Contratos/permisos RPC** (tanda 2)
- Aplicar contencion:
  - Si es seguridad/permisos, pausar despliegues y cambios manuales en DB hasta diagnostico.
  - Si es operativo, informar a Operaciones para control manual temporal.

## Escalamiento

- Escalar en este orden:
  1. Responsable de turno (Operaciones).
  2. Owner tecnico de base de datos/backend.
  3. Lider de producto/negocio si impacta facturacion, cobranza o cierres.
- Incluir siempre en el aviso:
  - Script afectado.
  - Hora exacta de ejecucion.
  - Resultado observado.
  - Impacto estimado.
  - Evidencia adjunta.

## Criterio de recuperacion

- Se considera recuperado cuando el script fallido vuelve a **PASS** en dos corridas consecutivas y el owner tecnico confirma normalizacion.
