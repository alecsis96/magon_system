-- Permite que administradores actualicen clientes sin afectar
-- la politica limitada del repartidor para capturas iniciales.

alter table if exists clientes enable row level security;

drop policy if exists "clientes_admin_update" on clientes;
create policy "clientes_admin_update"
on clientes
for update
to authenticated
using (es_usuario_admin())
with check (es_usuario_admin());
