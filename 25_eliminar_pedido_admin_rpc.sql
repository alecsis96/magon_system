create or replace function public.eliminar_pedido_admin(
    p_pedido_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pedido public.pedidos%rowtype;
    v_inventory public.inventario_diario%rowtype;
    v_inventory_id uuid;
    v_inventory_date date;
    v_inventory_fallback_date date;
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
    v_reversion_inventario_aplicada boolean := false;
    v_motivo_reversion_inventario text := null;
begin
    if auth.uid() is null then
        raise exception 'Debes iniciar sesion para realizar esta accion';
    end if;

    if not public.es_usuario_admin() then
        raise exception 'Solo un administrador puede eliminar pedidos';
    end if;

    select *
    into v_pedido
    from public.pedidos
    where id = p_pedido_id
    for update;

    if not found then
        raise exception 'No se encontro el pedido solicitado';
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

    if found then
        update public.inventario_diario
        set
            pollos_vendidos = greatest(0, coalesce(pollos_vendidos, 0) - v_piezas_revertidas),
            ventas_alas = greatest(0, coalesce(ventas_alas, 0) - v_ventas_alas),
            ventas_piernas = greatest(0, coalesce(ventas_piernas, 0) - v_ventas_piernas),
            ventas_muslos = greatest(0, coalesce(ventas_muslos, 0) - v_ventas_muslos),
            ventas_pechugas_g = greatest(0, coalesce(ventas_pechugas_g, 0) - v_ventas_pechugas_g),
            ventas_pechugas_c = greatest(0, coalesce(ventas_pechugas_c, 0) - v_ventas_pechugas_c),
            mermas_quemados = greatest(0, coalesce(mermas_quemados, 0) - v_mermas_revertidas),
            mermas_alas = greatest(0, coalesce(mermas_alas, 0) - v_mermas_alas),
            mermas_piernas = greatest(0, coalesce(mermas_piernas, 0) - v_mermas_piernas),
            mermas_muslos = greatest(0, coalesce(mermas_muslos, 0) - v_mermas_muslos),
            mermas_pechugas_g = greatest(0, coalesce(mermas_pechugas_g, 0) - v_mermas_pechugas_g),
            mermas_pechugas_c = greatest(0, coalesce(mermas_pechugas_c, 0) - v_mermas_pechugas_c)
        where id = v_inventory.id;

        v_inventory_id := v_inventory.id;
        v_reversion_inventario_aplicada := true;
    else
        v_inventory_id := null;
        v_reversion_inventario_aplicada := false;
        v_motivo_reversion_inventario :=
            format('No se encontro inventario para %s ni fallback %s', v_inventory_date, v_inventory_fallback_date);
    end if;

    delete from public.pedido_detalles
    where pedido_id = v_pedido.id;

    delete from public.pedidos
    where id = v_pedido.id;

    return jsonb_build_object(
        'pedido_id', v_pedido.id,
        'inventory_id', v_inventory_id,
        'ok', true,
        'reversion_inventario_aplicada', v_reversion_inventario_aplicada,
        'motivo_reversion_inventario', v_motivo_reversion_inventario,
        'piezas_revertidas', jsonb_build_object(
            'total', v_piezas_revertidas,
            'alas', v_ventas_alas,
            'piernas', v_ventas_piernas,
            'muslos', v_ventas_muslos,
            'pechugas_grandes', v_ventas_pechugas_g,
            'pechugas_chicas', v_ventas_pechugas_c
        )
    );
end;
$$;
