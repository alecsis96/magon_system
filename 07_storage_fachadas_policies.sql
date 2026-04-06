-- Configuracion de Storage para la app de repartidor con hardening.
-- Se mantiene lectura publica por requerimiento operativo,
-- pero se restringe escritura a uploads nuevos y se evita update/delete publico.

update storage.buckets
set public = true
where id = 'fachadas';

drop policy if exists "fachadas_public_read" on storage.objects;
create policy "fachadas_public_read"
on storage.objects
for select
to public
using (
    bucket_id = 'fachadas'
    and name like 'clientes/%'
);

drop policy if exists "fachadas_anon_insert" on storage.objects;
create policy "fachadas_anon_insert"
on storage.objects
for insert
to public
with check (
    bucket_id = 'fachadas'
    and name like 'clientes/%'
    and lower(right(name, 4)) = '.jpg'
);

drop policy if exists "fachadas_anon_update" on storage.objects;
create policy "fachadas_anon_update"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'fachadas'
    and public.es_usuario_admin()
)
with check (
    bucket_id = 'fachadas'
    and name like 'clientes/%'
    and lower(right(name, 4)) = '.jpg'
    and public.es_usuario_admin()
);

drop policy if exists "fachadas_anon_delete" on storage.objects;
create policy "fachadas_anon_delete"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'fachadas'
    and public.es_usuario_admin()
);
