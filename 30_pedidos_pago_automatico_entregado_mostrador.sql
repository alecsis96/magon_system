-- Regla negocio P0: entregado o mostrador siempre pagado.

update public.pedidos
set estado_pago = 'pagado'
where estado = 'entregado'
  and estado_pago is distinct from 'pagado';

update public.pedidos
set estado_pago = 'pagado'
where tipo_pedido = 'mostrador'
  and estado_pago is distinct from 'pagado';

create or replace function public.sync_pedidos_estado_pago_regla_pagado()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'entregado' or new.tipo_pedido = 'mostrador' then
    new.estado_pago := 'pagado';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_pedidos_estado_pago_regla_pagado on public.pedidos;

create trigger trg_sync_pedidos_estado_pago_regla_pagado
before insert or update on public.pedidos
for each row
execute function public.sync_pedidos_estado_pago_regla_pagado();
