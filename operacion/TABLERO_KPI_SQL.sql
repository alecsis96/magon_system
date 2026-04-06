-- Tablero operativo diario (solo lectura)
-- Parametro: :p_fecha (DATE)

-- 1) Facturacion, cobrado, pendiente del dia
with pedidos_dia as (
  select *
  from public.pedidos
  where fecha_creacion >= :p_fecha::date
    and fecha_creacion < (:p_fecha::date + interval '1 day')
)
select
  :p_fecha::date as fecha,
  count(*) as pedidos_total,
  coalesce(sum(total), 0)::numeric(12,2) as facturado_dia,
  coalesce(sum(case when estado_pago = 'pagado' then total else 0 end), 0)::numeric(12,2) as cobrado_dia,
  coalesce(sum(case when estado_pago = 'pendiente' then total else 0 end), 0)::numeric(12,2) as pendiente_dia
from pedidos_dia;

-- 2) Pedidos activos snapshot
select
  p.id as pedido_id,
  p.fecha_creacion,
  p.estado,
  p.estado_pago,
  p.tipo_pedido,
  p.metodo_pago,
  p.total::numeric(12,2) as total,
  c.nombre as cliente_nombre,
  c.telefono as cliente_telefono
from public.pedidos p
left join public.clientes c on c.id = p.cliente_id
where p.fecha_creacion < (:p_fecha::date + interval '1 day')
  and p.estado <> 'entregado'
order by p.fecha_creacion asc;

-- 3) Stock e inventario del dia
select
  i.fecha,
  i.stock_anterior,
  i.nuevos_ingresos,
  i.pollos_vendidos,
  i.mermas_quemados,
  i.mermas_caidos,
  i.ajustes_admin,
  i.stock_final,
  i.ventas_alas,
  i.ventas_piernas,
  i.ventas_muslos,
  i.ventas_pechugas_g,
  i.ventas_pechugas_c,
  i.mermas_alas,
  i.mermas_piernas,
  i.mermas_muslos,
  i.mermas_pechugas_g,
  i.mermas_pechugas_c
from public.inventario_diario i
where i.fecha = :p_fecha::date;

-- 4) Tasa de merma diaria
select
  i.fecha,
  (coalesce(i.mermas_quemados, 0) + coalesce(i.mermas_caidos, 0)) as mermas_totales,
  (coalesce(i.stock_anterior, 0) + coalesce(i.nuevos_ingresos, 0) + greatest(coalesce(i.ajustes_admin, 0), 0)) as base_operable,
  case
    when (coalesce(i.stock_anterior, 0) + coalesce(i.nuevos_ingresos, 0) + greatest(coalesce(i.ajustes_admin, 0), 0)) = 0 then 0::numeric
    else round(
      ((coalesce(i.mermas_quemados, 0) + coalesce(i.mermas_caidos, 0))::numeric /
      (coalesce(i.stock_anterior, 0) + coalesce(i.nuevos_ingresos, 0) + greatest(coalesce(i.ajustes_admin, 0), 0))::numeric) * 100, 2
    )
  end as tasa_merma_pct
from public.inventario_diario i
where i.fecha = :p_fecha::date;

-- 5) Conciliacion de cierre
select
  i.fecha,
  i.stock_final as stock_teorico_piezas,
  i.conteo_fisico_cierre as conteo_fisico_piezas,
  coalesce(i.diferencia_cierre, i.conteo_fisico_cierre - i.stock_final) as diferencia_cierre_piezas,
  i.cerrado_en
from public.inventario_diario i
where i.fecha = :p_fecha::date;

-- 6) Neto operativo (cobrado - egresos)
with cobros as (
  select coalesce(sum(total), 0)::numeric(12,2) as cobrado
  from public.pedidos
  where fecha_creacion >= :p_fecha::date
    and fecha_creacion < (:p_fecha::date + interval '1 day')
    and estado_pago = 'pagado'
),
egresos as (
  select coalesce(sum(monto), 0)::numeric(12,2) as egresos
  from public.egresos
  where fecha = :p_fecha::date
)
select
  :p_fecha::date as fecha,
  cobros.cobrado,
  egresos.egresos,
  (cobros.cobrado - egresos.egresos)::numeric(12,2) as neto_operativo
from cobros
cross join egresos;

-- 7) Aging de pendientes (0-1, 2-3, 4+ dias)
with pendientes as (
  select
    total,
    greatest((:p_fecha::date - fecha_creacion::date), 0) as edad_dias
  from public.pedidos
  where estado_pago = 'pendiente'
    and fecha_creacion::date <= :p_fecha::date
)
select
  case
    when edad_dias between 0 and 1 then '0-1 dias'
    when edad_dias between 2 and 3 then '2-3 dias'
    else '4+ dias'
  end as bucket,
  count(*) as pedidos,
  coalesce(sum(total), 0)::numeric(12,2) as monto_pendiente
from pendientes
group by bucket
order by case bucket when '0-1 dias' then 1 when '2-3 dias' then 2 else 3 end;
