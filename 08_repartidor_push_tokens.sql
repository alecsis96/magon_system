create table if not exists repartidor_push_tokens (
    id uuid primary key default uuid_generate_v4(),
    expo_push_token text not null unique,
    dispositivo_nombre text,
    plataforma text,
    activo boolean not null default true,
    creado_en timestamp default current_timestamp,
    actualizado_en timestamp default current_timestamp
);

create index if not exists repartidor_push_tokens_activo_idx
on repartidor_push_tokens (activo);
