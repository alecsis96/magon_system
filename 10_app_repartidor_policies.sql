-- Politicas para app repartidor con hardening gradual.
-- Se mantiene lectura publica de clientes para no romper el flujo actual,
-- pero se limita la actualizacion a capturas iniciales de entrega.

alter table if exists clientes enable row level security;
alter table if exists repartidor_push_tokens enable row level security;

drop policy if exists "clientes_public_select" on clientes;
create policy "clientes_public_select"
on clientes
for select
to public
using (true);

drop policy if exists "clientes_public_update_delivery_data" on clientes;
create policy "clientes_public_update_delivery_data"
on clientes
for update
to public
using (
    url_foto_fachada is null
    or latitud is null
    or longitud is null
)
with check (
    (latitud is null or (latitud >= -90 and latitud <= 90))
    and (longitud is null or (longitud >= -180 and longitud <= 180))
    and (
        url_foto_fachada is null
        or url_foto_fachada like 'https://%'
    )
);

drop policy if exists "repartidor_push_tokens_public_select" on repartidor_push_tokens;
create policy "repartidor_push_tokens_public_select"
on repartidor_push_tokens
for select
to authenticated
using (true);

drop policy if exists "repartidor_push_tokens_public_insert" on repartidor_push_tokens;
create policy "repartidor_push_tokens_public_insert"
on repartidor_push_tokens
for insert
to public
with check (
    (
        expo_push_token like 'ExponentPushToken[%]'
        or expo_push_token like 'ExpoPushToken[%]'
    )
    and length(expo_push_token) <= 255
);

drop policy if exists "repartidor_push_tokens_public_update" on repartidor_push_tokens;
create policy "repartidor_push_tokens_public_update"
on repartidor_push_tokens
for update
to public
using (true)
with check (
    (
        expo_push_token like 'ExponentPushToken[%]'
        or expo_push_token like 'ExpoPushToken[%]'
    )
    and length(expo_push_token) <= 255
);
