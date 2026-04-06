-- Insercion de clientes endurecida con validaciones de datos.
-- Se mantiene a public para no romper el flujo actual del POS.

alter table if exists clientes enable row level security;

drop policy if exists "clientes_public_insert" on clientes;
create policy "clientes_public_insert"
on clientes
for insert
to public
with check (
    telefono is not null
    and length(trim(telefono)) >= 8
    and nombre is not null
    and length(trim(nombre)) >= 2
    and (latitud is null or (latitud >= -90 and latitud <= 90))
    and (longitud is null or (longitud >= -180 and longitud <= 180))
    and (
        url_foto_fachada is null
        or url_foto_fachada like 'https://%'
    )
);
