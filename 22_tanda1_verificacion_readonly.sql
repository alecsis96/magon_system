-- Verificaciones solo lectura para cierre de Tanda 1.

-- RLS y policies en tablas sensibles.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where (schemaname = 'public' and tablename in ('clientes', 'repartidor_push_tokens'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- Estado del bucket de fachadas.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'fachadas';

-- Validacion de formato token de push.
select
  count(*) as total_tokens,
  count(*) filter (where activo is true) as activos,
  count(*) filter (where expo_push_token not like 'ExponentPushToken[%]') as formato_invalido,
  count(*) filter (where length(expo_push_token) > 255) as longitud_invalida
from public.repartidor_push_tokens;
