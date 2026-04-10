# P0-01 Matriz RPC Baseline

Objetivo: publicar un baseline verificable en repo de las RPC criticas consumidas por frontend (`admin-web` + `app-repartidor`) para detectar drift de contrato.

## Alcance del inventario
- Fuente de uso frontend: busqueda de llamadas `.rpc(` en `admin-web` y `app-repartidor`.
- Fuente de firma esperada: tipos versionados en `admin-web/src/types/database.ts` + definiciones SQL versionadas en repo.
- Validacion runtime en Supabase: fuera de este cambio de repo (queda pendiente).

## Matriz baseline

| RPC | Uso frontend (archivo) | Firma esperada (Args -> Returns) | Fuente de contrato en repo | Riesgo si hay drift | Estado inicial |
|---|---|---|---|---|---|
| `registrar_venta_pos` | `admin-web/src/App.tsx` | `p_total decimal(10,2), p_tipo_pedido varchar(50), p_metodo_pago varchar(50), p_estado_pago varchar(50), p_cliente_id uuid default null, p_estado varchar(50) default null, p_fecha date default current_date, p_detalles jsonb default '[]'::jsonb -> jsonb` | SQL: `23_checkout_printing_rpc.sql` (create/replace); Tipo TS: `admin-web/src/types/database.ts` (`Functions.registrar_venta_pos`) | Alto: checkout puede fallar en guardado de venta o persistir datos inconsistentes si cambia args/retorno | Pendiente validacion runtime |
| `get_printable_order` | `admin-web/src/App.tsx` | `p_pedido_id uuid -> jsonb` | SQL: `23_checkout_printing_rpc.sql`; Tipo TS: `admin-web/src/types/database.ts` (`Functions.get_printable_order`) | Alto: impresion/ticket y flujo post-venta fallan si cambia payload JSON esperado | Pendiente validacion runtime |
| `reabrir_inventario_dia` | `admin-web/src/components/InventoryManager.tsx` | `p_inventory_id uuid -> inventario_diario` | SQL: `05_admin_operacion.sql`; Tipo TS: `admin-web/src/types/database.ts` (`Functions.reabrir_inventario_dia`) | Medio/Alto: bloqueo operativo para reapertura o inconsistencia de estado diario | Pendiente validacion runtime |
| `guardar_producto_admin` | `admin-web/src/components/ProductCatalogManager.tsx` | `p_producto_id uuid default null, p_nombre text default null, p_descripcion text default null, p_precio decimal(10,2) default null, p_categoria text default null, p_subcategoria text default null, p_piezas_inventario integer default null, p_requiere_variante_3_4 boolean default false -> public.productos` | SQL vigente: `19_productos_piezas_inventario.sql` (redefine version previa de `05_admin_operacion.sql`); Tipo TS: `admin-web/src/types/database.ts` (`Functions.guardar_producto_admin`) | Alto: alta/edicion de catalogo puede romperse (campos nuevos o tipos distintos) | Pendiente validacion runtime |
| `eliminar_cliente_admin` | `admin-web/src/components/CustomerDirectoryAudit.tsx` | `p_cliente_id uuid -> uuid` | SQL: `16_clientes_delete_admin_rpc.sql`; Tipo TS: `admin-web/src/types/database.ts` (`Functions.eliminar_cliente_admin`) | Alto: riesgo de borrado fallido o comportamiento no esperado en auditoria/clientes | Pendiente validacion runtime |
| `es_usuario_admin` | `admin-web/src/lib/admin.ts` | `sin argumentos -> boolean` | SQL: `05_admin_operacion.sql`; Tipo TS: `admin-web/src/types/database.ts` (`Functions.es_usuario_admin`) | Alto: control de acceso admin puede quedar abierto/cerrado por error si cambia retorno/permisos | Pendiente validacion runtime |

## Hallazgo de inventario por app
- `admin-web`: usa 6 RPC criticas (listadas arriba).
- `app-repartidor`: sin llamadas directas `.rpc(` detectadas en el codigo versionado actual (estado baseline de este repo).

## Estado de validacion
- Baseline documental publicado en repo.
- Validacion runtime real en Supabase (existencia/firma/permisos) sigue pendiente via `24_tanda2_rpc_verificacion_readonly.sql`.
