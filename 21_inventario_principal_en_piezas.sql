alter table public.inventario_diario
drop column if exists stock_final;

alter table public.inventario_diario
alter column stock_anterior type integer using round(coalesce(stock_anterior, 0) * 10)::integer,
alter column nuevos_ingresos type integer using round(coalesce(nuevos_ingresos, 0) * 10)::integer,
alter column pollos_vendidos type integer using round(coalesce(pollos_vendidos, 0) * 10)::integer,
alter column ajustes_admin type integer using round(coalesce(ajustes_admin, 0) * 10)::integer,
alter column mermas_quemados type integer using round(coalesce(mermas_quemados, 0) * 10)::integer,
alter column mermas_caidos type integer using round(coalesce(mermas_caidos, 0) * 10)::integer,
alter column conteo_fisico_cierre type integer using case
  when conteo_fisico_cierre is null then null
  else round(conteo_fisico_cierre * 10)::integer
end,
alter column diferencia_cierre type integer using case
  when diferencia_cierre is null then null
  else round(diferencia_cierre * 10)::integer
end;

alter table public.inventario_diario
add column stock_final integer
generated always as (
  stock_anterior +
  nuevos_ingresos -
  pollos_vendidos -
  coalesce(mermas_quemados, 0) -
  coalesce(mermas_caidos, 0) +
  coalesce(ajustes_admin, 0)
) stored;

alter table public.inventario_movimientos
alter column cantidad_equivalente type integer using round(coalesce(cantidad_equivalente, 0) * 10)::integer;

update public.inventario_movimientos
set cantidad_piezas = cantidad_equivalente
where cantidad_piezas is null;
