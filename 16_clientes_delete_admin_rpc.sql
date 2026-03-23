create or replace function eliminar_cliente_admin(
    p_cliente_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cliente_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Debes iniciar sesion para realizar esta accion';
    end if;

    if not es_usuario_admin() then
        raise exception 'Solo un administrador puede eliminar clientes';
    end if;

    delete from clientes
    where id = p_cliente_id
    returning id into v_cliente_id;

    if v_cliente_id is null then
        raise exception 'No se encontro el cliente solicitado';
    end if;

    return v_cliente_id;
end;
$$;
