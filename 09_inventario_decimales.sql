alter table inventario_diario
drop column if exists stock_final;

alter table inventario_diario
alter column stock_anterior type numeric(10, 2) using stock_anterior::numeric,
alter column nuevos_ingresos type numeric(10, 2) using nuevos_ingresos::numeric,
alter column pollos_vendidos type numeric(10, 2) using pollos_vendidos::numeric,
alter column mermas_quemados type numeric(10, 2) using coalesce(mermas_quemados, 0)::numeric,
alter column mermas_caidos type numeric(10, 2) using coalesce(mermas_caidos, 0)::numeric;

alter table inventario_diario
add column stock_final numeric(10, 2)
generated always as (
  stock_anterior + nuevos_ingresos - pollos_vendidos - mermas_quemados - mermas_caidos
) stored;
