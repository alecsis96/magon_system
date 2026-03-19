-- Permite crear clientes desde admin-web usando la anon key.
-- Necesario porque admin-web registra clientes nuevos desde el POS.

alter table if exists clientes enable row level security;

drop policy if exists "clientes_public_insert" on clientes;
create policy "clientes_public_insert"
on clientes
for insert
to public
with check (true);
