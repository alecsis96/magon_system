create or replace function public.get_clientes_frecuencia_mensual(
    p_month date default null,
    p_limit integer default 10
)
returns table(
    cliente_id uuid,
    nombre text,
    telefono text,
    pedidos_mes bigint,
    total_mes numeric,
    ultimo_pedido_en timestamp
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_month_start date;
    v_month_end date;
begin
    if auth.uid() is null then
        raise exception 'Debes iniciar sesion para consultar clientes frecuentes';
    end if;

    if not public.es_usuario_admin() then
        raise exception 'Solo un administrador puede consultar clientes frecuentes';
    end if;

    v_month_start := coalesce(
        date_trunc('month', p_month::timestamp)::date,
        date_trunc('month', now() at time zone 'America/Mexico_City')::date
    );
    v_month_end := (v_month_start + interval '1 month')::date;

    return query
    select
        c.id as cliente_id,
        c.nombre,
        c.telefono,
        count(p.id) as pedidos_mes,
        coalesce(sum(p.total), 0)::numeric as total_mes,
        max(p.fecha_creacion) as ultimo_pedido_en
    from public.pedidos p
    join public.clientes c on c.id = p.cliente_id
    where p.cliente_id is not null
      and p.fecha_creacion is not null
      and (p.fecha_creacion at time zone 'America/Mexico_City') >= v_month_start::timestamp
      and (p.fecha_creacion at time zone 'America/Mexico_City') < v_month_end::timestamp
      and coalesce(lower(trim(p.estado)), '') not in ('cancelado', 'rechazado', 'devuelto')
    group by c.id, c.nombre, c.telefono
    order by count(p.id) desc, coalesce(sum(p.total), 0) desc, max(p.fecha_creacion) desc
    limit greatest(coalesce(p_limit, 10), 1);
end;
$$;
