create or replace function public.cancelar_pedido_para_correccion_supervisada(
    p_pedido_id uuid,
    p_motivo text
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
    v_estado_previo text;
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
    v_reversion_inventario_aplicada boolean := false;
    v_motivo_reversion_inventario text := null;
    v_evento_auditoria_id uuid := null;
begin
    v_actor_uid := auth.uid();

    if v_actor_uid is null then
        raise exception 'Debes iniciar sesion para cancelar pedidos';
    end if;

    if not public.es_usuario_admin() then
        raise exception 'Solo un administrador puede corregir pedidos entregados';
    end if;

    v_motivo_limpio := nullif(trim(coalesce(p_motivo, '')), '');

    if v_motivo_limpio is null or char_length(v_motivo_limpio) < 4 then
        raise exception 'Debes indicar un motivo de correccion de al menos 4 caracteres';
    end if;

    select *
    into v_pedido
    from public.pedidos
    where id = p_pedido_id
    for update;

    if not found then
        raise exception 'No se encontro el pedido solicitado';
    end if;

    v_estado_previo := coalesce(lower(trim(v_pedido.estado)), '');

    if v_estado_previo = 'cancelado' then
        return jsonb_build_object(
            'ok', true,
            'pedido', to_jsonb(v_pedido),
            'inventory_id', null,
            'audit_event_id', null,
            'motivo_cancelacion', coalesce(v_pedido.motivo_cancelacion, v_motivo_limpio),
            'reversion_inventario_aplicada', false,
            'motivo_reversion_inventario', 'El pedido ya estaba cancelado; no se aplico doble reversa',
            'supervisada', true,
            'ya_cancelado', true,
            'estado_previo', v_pedido.estado,
            'piezas_revertidas', jsonb_build_object(
                'total', 0,
                'alas', 0,
                'piernas', 0,
                'muslos', 0,
                'pechugas_grandes', 0,
                'pechugas_chicas', 0
            ),
            'mermas_revertidas', jsonb_build_object(
                'total', 0,
                'alas', 0,
                'piernas', 0,
                'muslos', 0,
                'pechugas_grandes', 0,
                'pechugas_chicas', 0
            )
        );
    end if;

    if v_estado_previo <> 'entregado' then
        raise exception 'Solo se permite correccion supervisada para pedidos entregados';
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
        v_reversion_inventario_aplicada := true;
    else
        v_inventory_id := null;
        v_reversion_inventario_aplicada := false;
        v_motivo_reversion_inventario :=
            format('No se encontro inventario para %s ni fallback %s', v_inventory_date, v_inventory_fallback_date);
    end if;

    update public.pedidos
    set
        estado = 'cancelado',
        motivo_cancelacion = v_motivo_limpio,
        cancelado_en = now(),
        cancelado_por = v_actor_uid
    where id = v_pedido.id
    returning * into v_pedido_actualizado;

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
                'pedido_cancelado_para_correccion_supervisada',
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
                    'tipo_cancelacion', 'correccion_supervisada',
                    'reversion_inventario_aplicada', v_reversion_inventario_aplicada,
                    'motivo_reversion_inventario', v_motivo_reversion_inventario,
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
        exception
            when others then
                v_evento_auditoria_id := null;
        end;
    end if;

    return jsonb_build_object(
        'ok', true,
        'pedido', to_jsonb(v_pedido_actualizado),
        'inventory_id', v_inventory_id,
        'audit_event_id', v_evento_auditoria_id,
        'motivo_cancelacion', v_motivo_limpio,
        'reversion_inventario_aplicada', v_reversion_inventario_aplicada,
        'motivo_reversion_inventario', v_motivo_reversion_inventario,
        'supervisada', true,
        'ya_cancelado', false,
        'estado_previo', v_pedido.estado,
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

revoke all on function public.cancelar_pedido_para_correccion_supervisada(uuid, text) from public;
grant execute on function public.cancelar_pedido_para_correccion_supervisada(uuid, text) to authenticated;
