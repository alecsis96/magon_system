alter table public.pedidos
  add column if not exists entrega_con_excepcion boolean not null default false,
  add column if not exists motivo_entrega_excepcion text,
  add column if not exists entregado_en timestamp;
