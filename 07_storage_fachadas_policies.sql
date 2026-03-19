-- Configuracion de Storage para la app de repartidor
-- Supuesto operativo actual:
-- - La app-repartidor usa la anon key y no inicia sesion.
-- - El bucket "fachadas" debe permitir upload y lectura publica.
--
-- Si despues agregas login para repartidores, conviene endurecer estas politicas
-- y permitir solo a usuarios autenticados o a un rol especifico.

update storage.buckets
set public = true
where id = 'fachadas';

drop policy if exists "fachadas_public_read" on storage.objects;
create policy "fachadas_public_read"
on storage.objects
for select
to public
using (bucket_id = 'fachadas');

drop policy if exists "fachadas_anon_insert" on storage.objects;
create policy "fachadas_anon_insert"
on storage.objects
for insert
to public
with check (bucket_id = 'fachadas');

drop policy if exists "fachadas_anon_update" on storage.objects;
create policy "fachadas_anon_update"
on storage.objects
for update
to public
using (bucket_id = 'fachadas')
with check (bucket_id = 'fachadas');

drop policy if exists "fachadas_anon_delete" on storage.objects;
create policy "fachadas_anon_delete"
on storage.objects
for delete
to public
using (bucket_id = 'fachadas');
