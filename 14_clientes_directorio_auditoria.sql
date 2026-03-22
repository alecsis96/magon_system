alter table if exists clientes
add column if not exists foto_valida boolean not null default true,
add column if not exists direccion_habitual text,
add column if not exists referencias text;

update clientes
set direccion_habitual = notas_entrega
where direccion_habitual is null
  and notas_entrega is not null
  and btrim(notas_entrega) <> '';
