alter table public.inventario_diario
drop column if exists stock_final;

alter table public.inventario_diario
add column if not exists ajustes_admin numeric(10, 2) not null default 0,
add column if not exists ajustes_alas integer not null default 0,
add column if not exists ajustes_piernas integer not null default 0,
add column if not exists ajustes_muslos integer not null default 0,
add column if not exists ajustes_pechugas_g integer not null default 0,
add column if not exists ajustes_pechugas_c integer not null default 0;

update public.inventario_diario
set
  ajustes_admin = coalesce(ajustes_admin, 0),
  ajustes_alas = coalesce(ajustes_alas, 0),
  ajustes_piernas = coalesce(ajustes_piernas, 0),
  ajustes_muslos = coalesce(ajustes_muslos, 0),
  ajustes_pechugas_g = coalesce(ajustes_pechugas_g, 0),
  ajustes_pechugas_c = coalesce(ajustes_pechugas_c, 0);

alter table public.inventario_diario
add column stock_final numeric(10, 2)
generated always as (
  stock_anterior +
  nuevos_ingresos -
  pollos_vendidos -
  coalesce(mermas_quemados, 0) -
  coalesce(mermas_caidos, 0) +
  coalesce(ajustes_admin, 0)
) stored;

create table if not exists public.inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references public.inventario_diario(id) on delete cascade,
  fecha date not null,
  tipo_movimiento varchar(40) not null,
  subtipo varchar(40),
  pieza varchar(40),
  cantidad_equivalente numeric(10, 2) not null default 0,
  cantidad_piezas integer,
  motivo text,
  registrado_por text,
  creado_en timestamptz not null default timezone('utc', now())
);

create index if not exists inventario_movimientos_inventario_idx
on public.inventario_movimientos (inventario_id, creado_en desc);

create index if not exists inventario_movimientos_fecha_idx
on public.inventario_movimientos (fecha desc, tipo_movimiento);
