-- Align push token policies to accept both Expo token prefixes.

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
