-- Politicas base para la app del repartidor usando anon key.
-- Solo aplican si RLS esta habilitado en estas tablas.

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
using (true)
with check (true);

drop policy if exists "repartidor_push_tokens_public_select" on repartidor_push_tokens;
create policy "repartidor_push_tokens_public_select"
on repartidor_push_tokens
for select
to public
using (true);

drop policy if exists "repartidor_push_tokens_public_insert" on repartidor_push_tokens;
create policy "repartidor_push_tokens_public_insert"
on repartidor_push_tokens
for insert
to public
with check (true);

drop policy if exists "repartidor_push_tokens_public_update" on repartidor_push_tokens;
create policy "repartidor_push_tokens_public_update"
on repartidor_push_tokens
for update
to public
using (true)
with check (true);
