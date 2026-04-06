# Roadmap de Calidad y CI (Equipo Chico)

Proyecto: `polleria-magon-sistema`
Equipo objetivo: 1 dev fullstack + operacion

## Estrategia de pruebas por capa
- Unit: logica pura de calculos/validaciones/helpers.
- Integracion: componentes + hooks + cliente Supabase mockeado.
- Smoke E2E: flujos criticos (venta, despacho, entrega, inventario).
- Contract checks: compatibilidad de RPC criticas.

Distribucion recomendada inicial:
- Integracion 60%
- Unit 25%
- Smoke/contract 15%

## Stack sugerido

### admin-web (React + Vite)
- Vitest
- @testing-library/react
- @testing-library/user-event
- MSW
- @vitest/coverage-v8
- Playwright (smoke basico)

### app-repartidor (Expo / RN)
- jest + jest-expo
- @testing-library/react-native
- Maestro (smoke mobile pragmatico)

## Plan por semanas

### Semana 1
- Configurar scripts: `test`, `test:ci`, `test:coverage`, `test:smoke`.
- Agregar ejemplos base de tests en ambos proyectos.

### Semana 2
- Integracion core admin-web (checkout, inventario, permisos).
- Mocks Supabase con MSW.

### Semana 3
- Integracion core app-repartidor (estado pedidos, errores, entrega).

### Semana 4
- Smoke minimo viable:
  - Web: 2 escenarios Playwright.
  - Mobile: 1-2 flujos Maestro.

### Semana 5-6
- Stabilizar flakiness y activar gates bloqueantes.
- Medir y ajustar tiempo de pipeline.

## Quality gates

### Minimo (mes 1)
- lint + typecheck: 100% verde.
- pass rate unit/integracion PR >=95%.
- smoke en main >=90%.
- coverage global >=35%.

### Objetivo (mes 3)
- pass rate >=98%.
- smoke >=95%.
- coverage global >=60%.
- coverage modulos criticos >=80%.

## Metricas de calidad
- Coverage (global y modulos criticos).
- Pass rate por suite.
- Change Failure Rate (CFR).
- MTTR.
- Flaky rate.
- Lead time de PR.
