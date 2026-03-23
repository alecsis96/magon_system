create or replace function registrar_venta(
    p_total decimal(10, 2),
    p_tipo_pedido varchar(50),
    p_metodo_pago varchar(50),
    p_estado_pago varchar(50),
    p_cliente_id uuid default null,
    p_estado varchar(50) default null,
    p_fecha date default current_date,
    p_detalles jsonb default '[]'::jsonb
)
returns inventario_diario
language plpgsql
security definer
set search_path = public
as $$
declare
    v_inventory inventario_diario%rowtype;
    v_updated_inventory inventario_diario%rowtype;
    v_pedido_id uuid;
    v_detalle jsonb;
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
    v_pollos_vendidos decimal(10, 2);
    v_mermas_quemadas decimal(10, 2);
begin
    if p_detalles is null
       or jsonb_typeof(p_detalles) <> 'array'
       or jsonb_array_length(p_detalles) = 0 then
        raise exception 'La venta debe incluir al menos un detalle';
    end if;

    select *
    into v_inventory
    from inventario_diario
    where fecha = p_fecha
    for update;

    insert into pedidos (
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
    returning id into v_pedido_id;

    for v_detalle in
        select value
        from jsonb_array_elements(p_detalles)
    loop
        v_ventas_alas := v_ventas_alas + coalesce((v_detalle->>'alas')::int, 0);
        v_ventas_piernas := v_ventas_piernas + coalesce((v_detalle->>'piernas')::int, 0);
        v_ventas_muslos := v_ventas_muslos + coalesce((v_detalle->>'muslos')::int, 0);
        v_ventas_pechugas_g := v_ventas_pechugas_g + coalesce((v_detalle->>'pechugas_grandes')::int, 0);
        v_ventas_pechugas_c := v_ventas_pechugas_c + coalesce((v_detalle->>'pechugas_chicas')::int, 0);

        v_mermas_alas := v_mermas_alas + coalesce((v_detalle->>'merma_alas')::int, 0);
        v_mermas_piernas := v_mermas_piernas + coalesce((v_detalle->>'merma_piernas')::int, 0);
        v_mermas_muslos := v_mermas_muslos + coalesce((v_detalle->>'merma_muslos')::int, 0);
        v_mermas_pechugas_g := v_mermas_pechugas_g + coalesce((v_detalle->>'merma_pechugas_grandes')::int, 0);
        v_mermas_pechugas_c := v_mermas_pechugas_c + coalesce((v_detalle->>'merma_pechugas_chicas')::int, 0);

        insert into pedido_detalles (
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
            v_pedido_id,
            nullif(v_detalle->>'producto_uuid', '')::uuid,
            coalesce(v_detalle->>'producto_codigo', 'sin_codigo'),
            coalesce(v_detalle->>'producto_nombre', 'Producto'),
            v_detalle->>'descripcion',
            coalesce((v_detalle->>'cantidad')::int, 1),
            coalesce((v_detalle->>'precio_unitario')::decimal(10, 2), 0),
            coalesce((v_detalle->>'subtotal')::decimal(10, 2), 0),
            nullif(v_detalle->>'variante_3_4', ''),
            nullif(v_detalle->>'merma_descripcion', ''),
            coalesce((v_detalle->>'alas')::int, 0),
            coalesce((v_detalle->>'piernas')::int, 0),
            coalesce((v_detalle->>'muslos')::int, 0),
            coalesce((v_detalle->>'pechugas_grandes')::int, 0),
            coalesce((v_detalle->>'pechugas_chicas')::int, 0),
            coalesce((v_detalle->>'merma_alas')::int, 0),
            coalesce((v_detalle->>'merma_piernas')::int, 0),
            coalesce((v_detalle->>'merma_muslos')::int, 0),
            coalesce((v_detalle->>'merma_pechugas_grandes')::int, 0),
            coalesce((v_detalle->>'merma_pechugas_chicas')::int, 0)
        );
    end loop;

    if v_inventory.id is null then
        return null;
    end if;

    v_pollos_vendidos := (
        v_ventas_alas +
        v_ventas_piernas +
        v_ventas_muslos +
        v_ventas_pechugas_g +
        v_ventas_pechugas_c
    ) / 10.0;

    v_mermas_quemadas := (
        v_mermas_alas +
        v_mermas_piernas +
        v_mermas_muslos +
        v_mermas_pechugas_g +
        v_mermas_pechugas_c
    ) / 10.0;

    update inventario_diario
    set
        pollos_vendidos = coalesce(pollos_vendidos, 0) + v_pollos_vendidos,
        ventas_alas = coalesce(ventas_alas, 0) + v_ventas_alas,
        ventas_piernas = coalesce(ventas_piernas, 0) + v_ventas_piernas,
        ventas_muslos = coalesce(ventas_muslos, 0) + v_ventas_muslos,
        ventas_pechugas_g = coalesce(ventas_pechugas_g, 0) + v_ventas_pechugas_g,
        ventas_pechugas_c = coalesce(ventas_pechugas_c, 0) + v_ventas_pechugas_c,
        mermas_quemados = coalesce(mermas_quemados, 0) + v_mermas_quemadas,
        mermas_alas = coalesce(mermas_alas, 0) + v_mermas_alas,
        mermas_piernas = coalesce(mermas_piernas, 0) + v_mermas_piernas,
        mermas_muslos = coalesce(mermas_muslos, 0) + v_mermas_muslos,
        mermas_pechugas_g = coalesce(mermas_pechugas_g, 0) + v_mermas_pechugas_g,
        mermas_pechugas_c = coalesce(mermas_pechugas_c, 0) + v_mermas_pechugas_c
    where id = v_inventory.id
    returning * into v_updated_inventory;

    return v_updated_inventory;
end;
$$;
