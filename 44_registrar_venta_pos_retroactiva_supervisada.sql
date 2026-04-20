create or replace function public.registrar_venta_pos_retroactiva_supervisada(
    p_total decimal(10, 2),
    p_tipo_pedido varchar(50),
    p_metodo_pago varchar(50),
    p_estado_pago varchar(50),
    p_fecha_hora_objetivo timestamptz,
    p_motivo text,
    p_cliente_id uuid default null,
    p_estado varchar(50) default null,
    p_detalles jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_uid uuid;
    v_actor_email text;
    v_inventory public.inventario_diario%rowtype;
    v_detalle jsonb;
    v_pedido public.pedidos%rowtype;
    v_fecha_creacion_objetivo timestamptz;
    v_fecha_inventario_objetivo date;
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
    v_piezas_vendidas int := 0;
    v_mermas_quemadas int := 0;
    v_inventory_autocreated boolean := false;
    v_evento_auditoria_id uuid := null;
begin
    v_actor_uid := auth.uid();

    if v_actor_uid is null then
        raise exception 'Debes iniciar sesion para registrar ventas retroactivas';
    end if;

    if not public.es_usuario_admin() then
        raise exception 'Solo un administrador puede registrar ventas retroactivas';
    end if;

    if p_fecha_hora_objetivo is null then
        raise exception 'Debes indicar una fecha y hora objetivo';
    end if;

    v_motivo_limpio := nullif(trim(coalesce(p_motivo, '')), '');

    if v_motivo_limpio is null or char_length(v_motivo_limpio) < 4 then
        raise exception 'Debes indicar un motivo de al menos 4 caracteres';
    end if;

    if p_detalles is null
       or jsonb_typeof(p_detalles) <> 'array'
       or jsonb_array_length(p_detalles) = 0 then
        raise exception 'La venta debe incluir al menos un detalle';
    end if;

    v_fecha_creacion_objetivo := p_fecha_hora_objetivo;
    v_fecha_inventario_objetivo :=
        (v_fecha_creacion_objetivo at time zone 'America/Mexico_City')::date;

    select *
    into v_inventory
    from public.inventario_diario
    where fecha = v_fecha_inventario_objetivo
    for update;

    if not found then
        begin
            insert into public.inventario_diario (
                fecha,
                stock_anterior,
                nuevos_ingresos,
                pollos_vendidos,
                ajustes_admin,
                ajustes_alas,
                ajustes_piernas,
                ajustes_muslos,
                ajustes_pechugas_g,
                ajustes_pechugas_c,
                ventas_alas,
                ventas_piernas,
                ventas_muslos,
                ventas_pechugas_g,
                ventas_pechugas_c,
                mermas_caidos,
                mermas_quemados,
                mermas_alas,
                mermas_piernas,
                mermas_muslos,
                mermas_pechugas_g,
                mermas_pechugas_c,
                conteo_fisico_cierre,
                diferencia_cierre,
                notas_cierre,
                cerrado_en,
                stock_alas,
                stock_piernas,
                stock_muslos,
                stock_pechugas_g,
                stock_pechugas_c,
                min_alas,
                min_piernas,
                min_muslos,
                min_pechugas_g,
                min_pechugas_c
            )
            values (
                v_fecha_inventario_objetivo,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                null,
                null,
                null,
                null,
                0,
                0,
                0,
                0,
                0,
                5,
                5,
                5,
                5,
                5
            )
            returning * into v_inventory;

            v_inventory_autocreated := true;
        exception
            when unique_violation then
                select *
                into v_inventory
                from public.inventario_diario
                where fecha = v_fecha_inventario_objetivo
                for update;
        end;
    end if;

    if not found then
        raise exception 'No se pudo preparar inventario para la fecha objetivo';
    end if;

    insert into public.pedidos (
        cliente_id,
        estado,
        tipo_pedido,
        total,
        metodo_pago,
        estado_pago,
        fecha_creacion
    )
    values (
        p_cliente_id,
        case
            when p_tipo_pedido = 'mostrador' then 'entregado'
            else coalesce(p_estado, 'en_preparacion')
        end,
        p_tipo_pedido,
        p_total,
        p_metodo_pago,
        p_estado_pago,
        v_fecha_creacion_objetivo
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

    if to_regclass('public.auditoria_eventos') is not null then
        begin
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
                'pedido_retroactivo_supervisado_registrado',
                'pedidos',
                v_pedido.id::text,
                jsonb_build_object(
                    'motivo', v_motivo_limpio,
                    'fecha_objetivo', v_fecha_creacion_objetivo,
                    'fecha_inventario_objetivo', v_fecha_inventario_objetivo,
                    'inventory_id', v_inventory.id,
                    'inventory_autocreated', v_inventory_autocreated,
                    'tipo_pedido', v_pedido.tipo_pedido,
                    'estado_pago', v_pedido.estado_pago,
                    'metodo_pago', v_pedido.metodo_pago,
                    'total', v_pedido.total,
                    'piezas_registradas', jsonb_build_object(
                        'total', v_piezas_vendidas,
                        'alas', v_ventas_alas,
                        'piernas', v_ventas_piernas,
                        'muslos', v_ventas_muslos,
                        'pechugas_grandes', v_ventas_pechugas_g,
                        'pechugas_chicas', v_ventas_pechugas_c
                    ),
                    'mermas_registradas', jsonb_build_object(
                        'total', v_mermas_quemadas,
                        'alas', v_mermas_alas,
                        'piernas', v_mermas_piernas,
                        'muslos', v_mermas_muslos,
                        'pechugas_grandes', v_mermas_pechugas_g,
                        'pechugas_chicas', v_mermas_pechugas_c
                    )
                )
            )
            returning id into v_evento_auditoria_id;
        exception
            when others then
                v_evento_auditoria_id := null;
        end;
    end if;

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
        'estado', v_pedido.estado,
        'retroactiva_supervisada', true,
        'inventory_id', v_inventory.id,
        'inventory_autocreated', v_inventory_autocreated,
        'audit_event_id', v_evento_auditoria_id,
        'fecha_inventario_objetivo', v_fecha_inventario_objetivo,
        'motivo', v_motivo_limpio
    );
end;
$$;

revoke all on function public.registrar_venta_pos_retroactiva_supervisada(
    decimal,
    varchar,
    varchar,
    varchar,
    timestamptz,
    text,
    uuid,
    varchar,
    jsonb
) from public;

grant execute on function public.registrar_venta_pos_retroactiva_supervisada(
    decimal,
    varchar,
    varchar,
    varchar,
    timestamptz,
    text,
    uuid,
    varchar,
    jsonb
) to authenticated;
