alter table public.pedidos
    add column if not exists pedido_corregido_de_id uuid;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'pedidos_pedido_corregido_de_id_fkey'
    ) then
        alter table public.pedidos
            add constraint pedidos_pedido_corregido_de_id_fkey
            foreign key (pedido_corregido_de_id) references public.pedidos(id);
    end if;
end;
$$;

create index if not exists idx_pedidos_pedido_corregido_de_id
    on public.pedidos (pedido_corregido_de_id);

create or replace function public.registrar_venta_pos(
    p_total decimal(10, 2),
    p_tipo_pedido varchar(50),
    p_metodo_pago varchar(50),
    p_estado_pago varchar(50),
    p_cliente_id uuid default null,
    p_estado varchar(50) default null,
    p_fecha date default current_date,
    p_pedido_corregido_de_id uuid default null,
    p_detalles jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_inventory public.inventario_diario%rowtype;
    v_detalle jsonb;
    v_pedido public.pedidos%rowtype;
    v_pedido_original public.pedidos%rowtype;
    v_ventas_alas int := 0;
    v_ventas_piernas int := 0;
    v_ventas_muslos int := 0;
    v_ventas_pechugas_g int := 0;
    v_ventas_pechugas_c int := 0;
    v_mermas_alas int := 0;
    v_mermas_piernas int := 0;
    v_mermas_muslos int := 0;
    v_mermas_pechugas_g int := 0;
    v_mermas_pechugas_c int := 0;
    v_piezas_vendidas int := 0;
    v_mermas_quemadas int := 0;
begin
    if auth.uid() is null then
        raise exception 'Debes iniciar sesion para registrar ventas';
    end if;

    if p_detalles is null
       or jsonb_typeof(p_detalles) <> 'array'
       or jsonb_array_length(p_detalles) = 0 then
        raise exception 'La venta debe incluir al menos un detalle';
    end if;

    if p_pedido_corregido_de_id is not null then
        select *
        into v_pedido_original
        from public.pedidos
        where id = p_pedido_corregido_de_id
        for share;

        if not found then
            raise exception 'No se encontro el pedido original a corregir';
        end if;
    end if;

    select *
    into v_inventory
    from public.inventario_diario
    where fecha = p_fecha
    for update;

    if not found then
        raise exception 'Inventario de hoy no iniciado';
    end if;

    insert into public.pedidos (
        pedido_corregido_de_id,
        cliente_id,
        estado,
        tipo_pedido,
        total,
        metodo_pago,
        estado_pago
    )
    values (
        p_pedido_corregido_de_id,
        p_cliente_id,
        case
            when p_tipo_pedido = 'mostrador' then 'entregado'
            else coalesce(p_estado, 'en_preparacion')
        end,
        p_tipo_pedido,
        p_total,
        p_metodo_pago,
        p_estado_pago
    )
    returning * into v_pedido;

    for v_detalle in
        select value
        from jsonb_array_elements(p_detalles)
    loop
        v_ventas_alas := v_ventas_alas + coalesce(nullif(v_detalle->>'alas', '')::int, 0);
        v_ventas_piernas := v_ventas_piernas + coalesce(nullif(v_detalle->>'piernas', '')::int, 0);
        v_ventas_muslos := v_ventas_muslos + coalesce(nullif(v_detalle->>'muslos', '')::int, 0);
        v_ventas_pechugas_g := v_ventas_pechugas_g + coalesce(nullif(v_detalle->>'pechugas_grandes', '')::int, 0);
        v_ventas_pechugas_c := v_ventas_pechugas_c + coalesce(nullif(v_detalle->>'pechugas_chicas', '')::int, 0);

        v_mermas_alas := v_mermas_alas + coalesce(nullif(v_detalle->>'merma_alas', '')::int, 0);
        v_mermas_piernas := v_mermas_piernas + coalesce(nullif(v_detalle->>'merma_piernas', '')::int, 0);
        v_mermas_muslos := v_mermas_muslos + coalesce(nullif(v_detalle->>'merma_muslos', '')::int, 0);
        v_mermas_pechugas_g := v_mermas_pechugas_g + coalesce(nullif(v_detalle->>'merma_pechugas_grandes', '')::int, 0);
        v_mermas_pechugas_c := v_mermas_pechugas_c + coalesce(nullif(v_detalle->>'merma_pechugas_chicas', '')::int, 0);

        v_piezas_vendidas := v_piezas_vendidas + coalesce(
            nullif(v_detalle->>'piezas_inventario', '')::int,
            coalesce(nullif(v_detalle->>'alas', '')::int, 0) +
            coalesce(nullif(v_detalle->>'piernas', '')::int, 0) +
            coalesce(nullif(v_detalle->>'muslos', '')::int, 0) +
            coalesce(nullif(v_detalle->>'pechugas_grandes', '')::int, 0) +
            coalesce(nullif(v_detalle->>'pechugas_chicas', '')::int, 0),
            0
        );

        insert into public.pedido_detalles (
            pedido_id,
            producto_id,
            producto_codigo,
            producto_nombre,
            descripcion,
            cantidad,
            precio_unitario,
            subtotal,
            variante_3_4,
            merma_descripcion,
            alas,
            piernas,
            muslos,
            pechugas_grandes,
            pechugas_chicas,
            merma_alas,
            merma_piernas,
            merma_muslos,
            merma_pechugas_grandes,
            merma_pechugas_chicas
        )
        values (
            v_pedido.id,
            nullif(v_detalle->>'producto_uuid', '')::uuid,
            coalesce(v_detalle->>'producto_codigo', 'sin_codigo'),
            coalesce(v_detalle->>'producto_nombre', 'Producto'),
            v_detalle->>'descripcion',
            coalesce(nullif(v_detalle->>'cantidad', '')::int, 1),
            coalesce(nullif(v_detalle->>'precio_unitario', '')::decimal(10, 2), 0),
            coalesce(nullif(v_detalle->>'subtotal', '')::decimal(10, 2), 0),
            nullif(v_detalle->>'variante_3_4', ''),
            nullif(v_detalle->>'merma_descripcion', ''),
            coalesce(nullif(v_detalle->>'alas', '')::int, 0),
            coalesce(nullif(v_detalle->>'piernas', '')::int, 0),
            coalesce(nullif(v_detalle->>'muslos', '')::int, 0),
            coalesce(nullif(v_detalle->>'pechugas_grandes', '')::int, 0),
            coalesce(nullif(v_detalle->>'pechugas_chicas', '')::int, 0),
            coalesce(nullif(v_detalle->>'merma_alas', '')::int, 0),
            coalesce(nullif(v_detalle->>'merma_piernas', '')::int, 0),
            coalesce(nullif(v_detalle->>'merma_muslos', '')::int, 0),
            coalesce(nullif(v_detalle->>'merma_pechugas_grandes', '')::int, 0),
            coalesce(nullif(v_detalle->>'merma_pechugas_chicas', '')::int, 0)
        );
    end loop;

    v_mermas_quemadas := (
        v_mermas_alas +
        v_mermas_piernas +
        v_mermas_muslos +
        v_mermas_pechugas_g +
        v_mermas_pechugas_c
    );

    update public.inventario_diario
    set
        pollos_vendidos = coalesce(pollos_vendidos, 0) + v_piezas_vendidas,
        ventas_alas = coalesce(ventas_alas, 0) + v_ventas_alas,
        ventas_piernas = coalesce(ventas_piernas, 0) + v_ventas_piernas,
        ventas_muslos = coalesce(ventas_muslos, 0) + v_ventas_muslos,
        ventas_pechugas_g = coalesce(ventas_pechugas_g, 0) + v_ventas_pechugas_g,
        ventas_pechugas_c = coalesce(ventas_pechugas_c, 0) + v_ventas_pechugas_c,
        stock_alas = greatest(0, coalesce(stock_alas, 0) - v_ventas_alas),
        stock_piernas = greatest(0, coalesce(stock_piernas, 0) - v_ventas_piernas),
        stock_muslos = greatest(0, coalesce(stock_muslos, 0) - v_ventas_muslos),
        stock_pechugas_g = greatest(0, coalesce(stock_pechugas_g, 0) - v_ventas_pechugas_g),
        stock_pechugas_c = greatest(0, coalesce(stock_pechugas_c, 0) - v_ventas_pechugas_c),
        mermas_quemados = coalesce(mermas_quemados, 0) + v_mermas_quemadas,
        mermas_alas = coalesce(mermas_alas, 0) + v_mermas_alas,
        mermas_piernas = coalesce(mermas_piernas, 0) + v_mermas_piernas,
        mermas_muslos = coalesce(mermas_muslos, 0) + v_mermas_muslos,
        mermas_pechugas_g = coalesce(mermas_pechugas_g, 0) + v_mermas_pechugas_g,
        mermas_pechugas_c = coalesce(mermas_pechugas_c, 0) + v_mermas_pechugas_c
    where id = v_inventory.id;

    return jsonb_build_object(
        'pedido_id', v_pedido.id,
        'pedido_corregido_de_id', v_pedido.pedido_corregido_de_id,
        'folio', null,
        'fecha_creacion', v_pedido.fecha_creacion,
        'total', v_pedido.total,
        'tipo_pedido', v_pedido.tipo_pedido,
        'metodo_pago', v_pedido.metodo_pago,
        'estado_pago', v_pedido.estado_pago,
        'cliente_id', v_pedido.cliente_id,
        'estado', v_pedido.estado
    );
end;
$$;

create or replace function public.cancelar_pedido_para_correccion(
    p_pedido_id uuid,
    p_motivo text default 'correccion'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_uid uuid;
    v_actor_email text;
    v_pedido public.pedidos%rowtype;
    v_pedido_actualizado public.pedidos%rowtype;
    v_inventory public.inventario_diario%rowtype;
    v_inventory_id uuid;
    v_inventory_date date;
    v_inventory_fallback_date date;
    v_motivo_limpio text;
    v_ventas_alas int := 0;
    v_ventas_piernas int := 0;
    v_ventas_muslos int := 0;
    v_ventas_pechugas_g int := 0;
    v_ventas_pechugas_c int := 0;
    v_mermas_alas int := 0;
    v_mermas_piernas int := 0;
    v_mermas_muslos int := 0;
    v_mermas_pechugas_g int := 0;
    v_mermas_pechugas_c int := 0;
    v_piezas_revertidas int := 0;
    v_mermas_revertidas int := 0;
    v_evento_auditoria_id uuid := null;
begin
    v_actor_uid := auth.uid();

    if v_actor_uid is null then
        raise exception 'Debes iniciar sesion para cancelar pedidos';
    end if;

    v_motivo_limpio := nullif(trim(coalesce(p_motivo, 'correccion')), '');

    if v_motivo_limpio is null then
        v_motivo_limpio := 'correccion';
    end if;

    select *
    into v_pedido
    from public.pedidos
    where id = p_pedido_id
    for update;

    if not found then
        raise exception 'No se encontro el pedido solicitado';
    end if;

    if coalesce(lower(trim(v_pedido.estado)), '') = 'entregado' then
        raise exception 'No se puede corregir un pedido entregado';
    end if;

    if coalesce(lower(trim(v_pedido.estado)), '') = 'cancelado' then
        raise exception 'El pedido ya fue cancelado';
    end if;

    v_inventory_date := case
        when v_pedido.fecha_creacion is null then (now() at time zone 'America/Mexico_City')::date
        else (v_pedido.fecha_creacion at time zone 'America/Mexico_City')::date
    end;

    v_inventory_fallback_date := case
        when v_pedido.fecha_creacion is null then (now() at time zone 'UTC')::date
        else (v_pedido.fecha_creacion at time zone 'UTC')::date
    end;

    select
        coalesce(sum(d.alas), 0),
        coalesce(sum(d.piernas), 0),
        coalesce(sum(d.muslos), 0),
        coalesce(sum(d.pechugas_grandes), 0),
        coalesce(sum(d.pechugas_chicas), 0),
        coalesce(sum(d.merma_alas), 0),
        coalesce(sum(d.merma_piernas), 0),
        coalesce(sum(d.merma_muslos), 0),
        coalesce(sum(d.merma_pechugas_grandes), 0),
        coalesce(sum(d.merma_pechugas_chicas), 0)
    into
        v_ventas_alas,
        v_ventas_piernas,
        v_ventas_muslos,
        v_ventas_pechugas_g,
        v_ventas_pechugas_c,
        v_mermas_alas,
        v_mermas_piernas,
        v_mermas_muslos,
        v_mermas_pechugas_g,
        v_mermas_pechugas_c
    from public.pedido_detalles d
    where d.pedido_id = v_pedido.id;

    v_piezas_revertidas :=
        v_ventas_alas +
        v_ventas_piernas +
        v_ventas_muslos +
        v_ventas_pechugas_g +
        v_ventas_pechugas_c;

    v_mermas_revertidas :=
        v_mermas_alas +
        v_mermas_piernas +
        v_mermas_muslos +
        v_mermas_pechugas_g +
        v_mermas_pechugas_c;

    select *
    into v_inventory
    from public.inventario_diario
    where fecha in (v_inventory_date, v_inventory_fallback_date)
    order by case
        when fecha = v_inventory_date then 0
        else 1
    end
    limit 1
    for update;

    if not found then
        raise exception 'No se encontro inventario para % ni fallback %', v_inventory_date, v_inventory_fallback_date;
    end if;

    update public.inventario_diario
    set
        pollos_vendidos = greatest(0, coalesce(pollos_vendidos, 0) - v_piezas_revertidas),
        ventas_alas = greatest(0, coalesce(ventas_alas, 0) - v_ventas_alas),
        ventas_piernas = greatest(0, coalesce(ventas_piernas, 0) - v_ventas_piernas),
        ventas_muslos = greatest(0, coalesce(ventas_muslos, 0) - v_ventas_muslos),
        ventas_pechugas_g = greatest(0, coalesce(ventas_pechugas_g, 0) - v_ventas_pechugas_g),
        ventas_pechugas_c = greatest(0, coalesce(ventas_pechugas_c, 0) - v_ventas_pechugas_c),
        stock_alas = coalesce(stock_alas, 0) + v_ventas_alas,
        stock_piernas = coalesce(stock_piernas, 0) + v_ventas_piernas,
        stock_muslos = coalesce(stock_muslos, 0) + v_ventas_muslos,
        stock_pechugas_g = coalesce(stock_pechugas_g, 0) + v_ventas_pechugas_g,
        stock_pechugas_c = coalesce(stock_pechugas_c, 0) + v_ventas_pechugas_c,
        mermas_quemados = greatest(0, coalesce(mermas_quemados, 0) - v_mermas_revertidas),
        mermas_alas = greatest(0, coalesce(mermas_alas, 0) - v_mermas_alas),
        mermas_piernas = greatest(0, coalesce(mermas_piernas, 0) - v_mermas_piernas),
        mermas_muslos = greatest(0, coalesce(mermas_muslos, 0) - v_mermas_muslos),
        mermas_pechugas_g = greatest(0, coalesce(mermas_pechugas_g, 0) - v_mermas_pechugas_g),
        mermas_pechugas_c = greatest(0, coalesce(mermas_pechugas_c, 0) - v_mermas_pechugas_c)
    where id = v_inventory.id;

    v_inventory_id := v_inventory.id;

    update public.pedidos
    set
        estado = 'cancelado',
        motivo_cancelacion = v_motivo_limpio,
        cancelado_en = now(),
        cancelado_por = v_actor_uid
    where id = v_pedido.id
    returning * into v_pedido_actualizado;

    if to_regclass('public.auditoria_eventos') is not null then
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
            'pedidos',
            'pedido_cancelado_para_correccion',
            'pedidos',
            v_pedido.id::text,
            jsonb_build_object(
                'estado_previo', v_pedido.estado,
                'estado_pago_previo', v_pedido.estado_pago,
                'motivo_cancelacion', v_motivo_limpio,
                'inventory_id', v_inventory_id,
                'tipo_pedido', v_pedido.tipo_pedido,
                'total', v_pedido.total,
                'fecha_creacion', v_pedido.fecha_creacion,
                'tipo_cancelacion', 'correccion',
                'piezas_revertidas', jsonb_build_object(
                    'total', v_piezas_revertidas,
                    'alas', v_ventas_alas,
                    'piernas', v_ventas_piernas,
                    'muslos', v_ventas_muslos,
                    'pechugas_grandes', v_ventas_pechugas_g,
                    'pechugas_chicas', v_ventas_pechugas_c
                ),
                'mermas_revertidas', jsonb_build_object(
                    'total', v_mermas_revertidas,
                    'alas', v_mermas_alas,
                    'piernas', v_mermas_piernas,
                    'muslos', v_mermas_muslos,
                    'pechugas_grandes', v_mermas_pechugas_g,
                    'pechugas_chicas', v_mermas_pechugas_c
                )
            )
        )
        returning id into v_evento_auditoria_id;
    end if;

    return jsonb_build_object(
        'ok', true,
        'pedido', to_jsonb(v_pedido_actualizado),
        'inventory_id', v_inventory_id,
        'motivo_cancelacion', v_motivo_limpio,
        'reversion_inventario_aplicada', true,
        'motivo_reversion_inventario', null,
        'audit_event_id', v_evento_auditoria_id,
        'piezas_revertidas', jsonb_build_object(
            'total', v_piezas_revertidas,
            'alas', v_ventas_alas,
            'piernas', v_ventas_piernas,
            'muslos', v_ventas_muslos,
            'pechugas_grandes', v_ventas_pechugas_g,
            'pechugas_chicas', v_ventas_pechugas_c
        ),
        'mermas_revertidas', jsonb_build_object(
            'total', v_mermas_revertidas,
            'alas', v_mermas_alas,
            'piernas', v_mermas_piernas,
            'muslos', v_mermas_muslos,
            'pechugas_grandes', v_mermas_pechugas_g,
            'pechugas_chicas', v_mermas_pechugas_c
        )
    );
end;
$$;

revoke all on function public.cancelar_pedido_para_correccion(uuid, text) from public;
grant execute on function public.cancelar_pedido_para_correccion(uuid, text) to authenticated;
