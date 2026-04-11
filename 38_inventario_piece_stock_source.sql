-- Modelo robusto de stock por pieza como fuente primaria.
-- Idempotente: agrega columnas faltantes, recalcula stock por pieza y alinea stock_final.

alter table public.inventario_diario
add column if not exists stock_alas integer not null default 0,
add column if not exists stock_piernas integer not null default 0,
add column if not exists stock_muslos integer not null default 0,
add column if not exists stock_pechugas_g integer not null default 0,
add column if not exists stock_pechugas_c integer not null default 0;

with normalized as (
  select
    id,
    greatest(
      0,
      round(coalesce(stock_anterior, 0))::integer + round(coalesce(nuevos_ingresos, 0))::integer
    ) as base_total,
    round(coalesce(ventas_alas, 0))::integer as ventas_alas,
    round(coalesce(ventas_piernas, 0))::integer as ventas_piernas,
    round(coalesce(ventas_muslos, 0))::integer as ventas_muslos,
    round(coalesce(ventas_pechugas_g, 0))::integer as ventas_pechugas_g,
    round(coalesce(ventas_pechugas_c, 0))::integer as ventas_pechugas_c,
    round(coalesce(mermas_alas, 0))::integer as mermas_alas,
    round(coalesce(mermas_piernas, 0))::integer as mermas_piernas,
    round(coalesce(mermas_muslos, 0))::integer as mermas_muslos,
    round(coalesce(mermas_pechugas_g, 0))::integer as mermas_pechugas_g,
    round(coalesce(mermas_pechugas_c, 0))::integer as mermas_pechugas_c,
    round(coalesce(ajustes_alas, 0))::integer as ajustes_alas,
    round(coalesce(ajustes_piernas, 0))::integer as ajustes_piernas,
    round(coalesce(ajustes_muslos, 0))::integer as ajustes_muslos,
    round(coalesce(ajustes_pechugas_g, 0))::integer as ajustes_pechugas_g,
    round(coalesce(ajustes_pechugas_c, 0))::integer as ajustes_pechugas_c
  from public.inventario_diario
), distributed as (
  select
    id,
    (base_total / 5) as base_floor,
    (base_total % 5) as base_remainder,
    ventas_alas,
    ventas_piernas,
    ventas_muslos,
    ventas_pechugas_g,
    ventas_pechugas_c,
    mermas_alas,
    mermas_piernas,
    mermas_muslos,
    mermas_pechugas_g,
    mermas_pechugas_c,
    ajustes_alas,
    ajustes_piernas,
    ajustes_muslos,
    ajustes_pechugas_g,
    ajustes_pechugas_c
  from normalized
), calculated as (
  select
    id,
    (base_floor + case when base_remainder >= 1 then 1 else 0 end)
      - ventas_alas - mermas_alas + ajustes_alas as stock_alas,
    (base_floor + case when base_remainder >= 2 then 1 else 0 end)
      - ventas_piernas - mermas_piernas + ajustes_piernas as stock_piernas,
    (base_floor + case when base_remainder >= 3 then 1 else 0 end)
      - ventas_muslos - mermas_muslos + ajustes_muslos as stock_muslos,
    (base_floor + case when base_remainder >= 4 then 1 else 0 end)
      - ventas_pechugas_g - mermas_pechugas_g + ajustes_pechugas_g as stock_pechugas_g,
    (base_floor + case when base_remainder >= 5 then 1 else 0 end)
      - ventas_pechugas_c - mermas_pechugas_c + ajustes_pechugas_c as stock_pechugas_c
  from distributed
)
update public.inventario_diario i
set
  stock_alas = c.stock_alas,
  stock_piernas = c.stock_piernas,
  stock_muslos = c.stock_muslos,
  stock_pechugas_g = c.stock_pechugas_g,
  stock_pechugas_c = c.stock_pechugas_c
from calculated c
where i.id = c.id
  and (
    coalesce(i.stock_alas, 0) <> c.stock_alas
    or coalesce(i.stock_piernas, 0) <> c.stock_piernas
    or coalesce(i.stock_muslos, 0) <> c.stock_muslos
    or coalesce(i.stock_pechugas_g, 0) <> c.stock_pechugas_g
    or coalesce(i.stock_pechugas_c, 0) <> c.stock_pechugas_c
  );

do $$
declare
  v_stock_final_expr text;
begin
  select pg_get_expr(d.adbin, d.adrelid)
  into v_stock_final_expr
  from pg_attribute a
  join pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where a.attrelid = 'public.inventario_diario'::regclass
    and a.attname = 'stock_final';

  if v_stock_final_expr is null or position('stock_alas' in v_stock_final_expr) = 0 then
    alter table public.inventario_diario
    drop column if exists stock_final;

    alter table public.inventario_diario
    add column stock_final integer
    generated always as (
      coalesce(stock_alas, 0)
      + coalesce(stock_piernas, 0)
      + coalesce(stock_muslos, 0)
      + coalesce(stock_pechugas_g, 0)
      + coalesce(stock_pechugas_c, 0)
    ) stored;
  end if;
end
$$;
