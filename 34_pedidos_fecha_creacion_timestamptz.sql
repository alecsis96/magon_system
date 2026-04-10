-- Normaliza pedidos.fecha_creacion para evitar drift de fecha/hora por zona horaria.
-- Se asume que los valores historicos en timestamp representan reloj UTC.

do $$
declare
    v_data_type text;
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'pedidos'
          and column_name = 'fecha_creacion'
    ) then
        raise notice 'Saltando migracion: public.pedidos.fecha_creacion no existe';
        return;
    end if;

    select data_type
    into v_data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pedidos'
      and column_name = 'fecha_creacion';

    if v_data_type = 'timestamp without time zone' then
        update public.pedidos
        set fecha_creacion = current_timestamp at time zone 'UTC'
        where fecha_creacion is null;

        alter table public.pedidos
            alter column fecha_creacion type timestamp with time zone
            using (fecha_creacion at time zone 'UTC');
    end if;

    alter table public.pedidos
        alter column fecha_creacion set default current_timestamp;
end;
$$;
