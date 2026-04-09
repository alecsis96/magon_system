-- RPC robusta para actualizar clientes desde admin-web
-- sin depender de politicas RLS de update en cliente.

create or replace function actualizar_cliente_admin(
    p_cliente_id uuid,
    p_nombre text,
    p_telefono text,
    p_direccion_habitual text default null,
    p_referencias text default null
)
returns clientes
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cliente clientes%rowtype;
    v_nombre text;
    v_telefono text;
    v_direccion_habitual text;
    v_referencias text;
begin
    if auth.uid() is null then
        raise exception 'Debes iniciar sesion para realizar esta accion';
    end if;

    if not es_usuario_admin() then
        raise exception 'Solo un administrador puede editar clientes';
    end if;

    if p_cliente_id is null then
        raise exception 'Debes indicar el cliente a actualizar';
    end if;

    v_nombre := nullif(trim(coalesce(p_nombre, '')), '');
    v_telefono := nullif(trim(coalesce(p_telefono, '')), '');
    v_direccion_habitual := nullif(trim(coalesce(p_direccion_habitual, '')), '');
    v_referencias := nullif(trim(coalesce(p_referencias, '')), '');

    if v_nombre is null or v_telefono is null then
        raise exception 'Nombre y telefono son obligatorios';
    end if;

    update clientes
    set
        nombre = v_nombre,
        telefono = v_telefono,
        direccion_habitual = v_direccion_habitual,
        referencias = v_referencias,
        notas_entrega = case
            when v_direccion_habitual is null and v_referencias is null then null
            when v_direccion_habitual is null then 'Referencias: ' || v_referencias
            when v_referencias is null then v_direccion_habitual
            else v_direccion_habitual || E'\nReferencias: ' || v_referencias
        end
    where id = p_cliente_id
    returning * into v_cliente;

    if not found then
        raise exception 'No se encontro el cliente solicitado';
    end if;

    return v_cliente;
end;
$$;
