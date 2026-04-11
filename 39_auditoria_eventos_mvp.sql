create extension if not exists "uuid-ossp";

create table if not exists public.auditoria_eventos (
    id uuid primary key default uuid_generate_v4(),
    creado_en timestamptz not null default now(),
    actor_uid uuid null,
    actor_email text null,
    modulo text not null,
    accion text not null,
    entidad text not null,
    entidad_id text null,
    detalle jsonb not null default '{}'::jsonb,
    constraint auditoria_eventos_modulo_check check (
        modulo in ('inventario', 'productos', 'pedidos', 'contabilidad', 'clientes', 'sistema')
    )
);

create index if not exists auditoria_eventos_creado_en_desc_idx
    on public.auditoria_eventos (creado_en desc);

create index if not exists auditoria_eventos_modulo_idx
    on public.auditoria_eventos (modulo);

create index if not exists auditoria_eventos_actor_uid_idx
    on public.auditoria_eventos (actor_uid);

alter table public.auditoria_eventos enable row level security;

drop policy if exists auditoria_eventos_admin_select on public.auditoria_eventos;
create policy auditoria_eventos_admin_select
on public.auditoria_eventos
for select
to authenticated
using (public.es_usuario_admin());

drop policy if exists auditoria_eventos_admin_insert on public.auditoria_eventos;
create policy auditoria_eventos_admin_insert
on public.auditoria_eventos
for insert
to authenticated
with check (public.es_usuario_admin());

create or replace function public.registrar_evento_auditoria(
    p_modulo text,
    p_accion text,
    p_entidad text,
    p_entidad_id text default null,
    p_detalle jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_uid uuid;
    v_actor_email text;
    v_evento_id uuid;
begin
    v_actor_uid := auth.uid();

    if v_actor_uid is null then
        raise exception 'Debes iniciar sesion para registrar auditoria';
    end if;

    if not public.es_usuario_admin() then
        raise exception 'Solo un administrador puede registrar auditoria';
    end if;

    if coalesce(trim(p_modulo), '') = ''
        or p_modulo not in ('inventario', 'productos', 'pedidos', 'contabilidad', 'clientes', 'sistema') then
        raise exception 'Modulo de auditoria invalido';
    end if;

    if coalesce(trim(p_accion), '') = '' then
        raise exception 'La accion de auditoria es obligatoria';
    end if;

    if coalesce(trim(p_entidad), '') = '' then
        raise exception 'La entidad de auditoria es obligatoria';
    end if;

    v_actor_email := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');

    if v_actor_email is null then
        select u.email
        into v_actor_email
        from auth.users u
        where u.id = v_actor_uid;
    end if;

    insert into public.auditoria_eventos (
        actor_uid,
        actor_email,
        modulo,
        accion,
        entidad,
        entidad_id,
        detalle
    )
    values (
        v_actor_uid,
        v_actor_email,
        trim(p_modulo),
        trim(p_accion),
        trim(p_entidad),
        nullif(trim(coalesce(p_entidad_id, '')), ''),
        coalesce(p_detalle, '{}'::jsonb)
    )
    returning id into v_evento_id;

    return v_evento_id;
end;
$$;

revoke all on function public.registrar_evento_auditoria(text, text, text, text, jsonb) from public;
grant execute on function public.registrar_evento_auditoria(text, text, text, text, jsonb) to authenticated;
