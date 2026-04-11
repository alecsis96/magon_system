-- Umbrales minimos por pieza para alertas de bajo stock (MVP).
-- Idempotente: agrega columnas faltantes y fuerza default/not null.

alter table public.inventario_diario
add column if not exists min_alas integer,
add column if not exists min_piernas integer,
add column if not exists min_muslos integer,
add column if not exists min_pechugas_g integer,
add column if not exists min_pechugas_c integer;

update public.inventario_diario
set
  min_alas = coalesce(min_alas, 5),
  min_piernas = coalesce(min_piernas, 5),
  min_muslos = coalesce(min_muslos, 5),
  min_pechugas_g = coalesce(min_pechugas_g, 5),
  min_pechugas_c = coalesce(min_pechugas_c, 5)
where min_alas is null
   or min_piernas is null
   or min_muslos is null
   or min_pechugas_g is null
   or min_pechugas_c is null;

alter table public.inventario_diario
alter column min_alas set default 5,
alter column min_alas set not null,
alter column min_piernas set default 5,
alter column min_piernas set not null,
alter column min_muslos set default 5,
alter column min_muslos set not null,
alter column min_pechugas_g set default 5,
alter column min_pechugas_g set not null,
alter column min_pechugas_c set default 5,
alter column min_pechugas_c set not null;
