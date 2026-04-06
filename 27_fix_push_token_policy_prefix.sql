-- Ajuste de policy para aceptar prefijos actuales y legacy de Expo Push tokens.

drop policy if exists "repartidor_push_tokens_public_insert" on public.repartidor_push_tokens;
create policy "repartidor_push_tokens_public_insert"
on public.repartidor_push_tokens
for insert
to public
with check (
  (
    expo_push_token like 'ExponentPushToken[%]'
    or expo_push_token like 'ExpoPushToken[%]'
  )
  and length(expo_push_token) <= 255
);

drop policy if exists "repartidor_push_tokens_public_update" on public.repartidor_push_tokens;
create policy "repartidor_push_tokens_public_update"
on public.repartidor_push_tokens
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
