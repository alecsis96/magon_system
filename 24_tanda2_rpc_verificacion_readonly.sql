-- Verificacion read-only de contratos RPC para Tanda 2.

with expected(proname) as (
  values
    ('registrar_venta_pos'),
    ('get_printable_order'),
    ('reabrir_inventario_dia'),
    ('guardar_producto_admin'),
    ('eliminar_cliente_admin'),
    ('es_usuario_admin')
)
select
  e.proname as rpc_esperada,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = e.proname
  ) as existe_en_db
from expected e
order by e.proname;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as firma,
  pg_get_function_result(p.oid) as retorno
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'registrar_venta_pos',
    'get_printable_order',
    'reabrir_inventario_dia',
    'guardar_producto_admin',
    'eliminar_cliente_admin',
    'es_usuario_admin'
  )
order by p.proname, firma;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as firma,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'registrar_venta_pos',
    'get_printable_order',
    'reabrir_inventario_dia',
    'guardar_producto_admin',
    'eliminar_cliente_admin',
    'es_usuario_admin'
  )
order by p.proname, firma;
