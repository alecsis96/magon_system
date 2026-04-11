create or replace function public.registrar_venta_pos(
    p_total decimal(10, 2),
    p_tipo_pedido varchar(50),
    p_metodo_pago varchar(50),
    p_estado_pago varchar(50),
    p_cliente_id uuid default null,
    p_estado varchar(50) default null,
    p_fecha date default current_date,
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

    select *
    into v_inventory
    from public.inventario_diario
    where fecha = p_fecha
    for update;

    if not found then
        raise exception 'Inventario de hoy no iniciado';
    end if;

    insert into public.pedidos (
        cliente_id,
        estado,
        tipo_pedido,
        total,
        metodo_pago,
        estado_pago
    )
    values (
        p_cliente_id,
        coalesce(p_estado, 'en_preparacion'),
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

create or replace function public.get_printable_order(
    p_pedido_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_order jsonb;
begin
    if auth.uid() is null then
        raise exception 'Debes iniciar sesion para imprimir pedidos';
    end if;

    select jsonb_build_object(
        'pedido_id', p.id,
        'folio', null,
        'fecha_creacion', p.fecha_creacion,
        'estado', p.estado,
        'tipo_pedido', p.tipo_pedido,
        'metodo_pago', p.metodo_pago,
        'estado_pago', p.estado_pago,
        'total', p.total,
        'cliente_id', p.cliente_id,
        'cliente_nombre', c.nombre,
        'cliente_telefono', c.telefono,
        'cliente_impresion', nullif(trim(coalesce(c.nombre, '')), ''),
        'items', coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'detalle_id', d.id,
                        'pedido_id', d.pedido_id,
                        'producto_id', d.producto_id,
                        'producto_codigo', d.producto_codigo,
                        'producto_nombre', d.producto_nombre,
                        'descripcion', d.descripcion,
                        'cantidad', d.cantidad,
                        'precio_unitario', d.precio_unitario,
                        'subtotal', d.subtotal,
                        'variante_3_4', d.variante_3_4,
                        'merma_descripcion', d.merma_descripcion,
                        'alas', d.alas,
                        'piernas', d.piernas,
                        'muslos', d.muslos,
                        'pechugas_grandes', d.pechugas_grandes,
                        'pechugas_chicas', d.pechugas_chicas,
                        'merma_alas', d.merma_alas,
                        'merma_piernas', d.merma_piernas,
                        'merma_muslos', d.merma_muslos,
                        'merma_pechugas_grandes', d.merma_pechugas_grandes,
                        'merma_pechugas_chicas', d.merma_pechugas_chicas
                    )
                    order by d.creado_en, d.id
                )
                from public.pedido_detalles d
                where d.pedido_id = p.id
            ),
            '[]'::jsonb
        )
    )
    into v_order
    from public.pedidos p
    left join public.clientes c on c.id = p.cliente_id
    where p.id = p_pedido_id;

    if v_order is null then
        raise exception 'No se encontro el pedido solicitado';
    end if;

    return v_order;
end;
$$;
