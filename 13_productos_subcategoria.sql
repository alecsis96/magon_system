alter table public.productos
add column if not exists subcategoria varchar(50);

update public.productos
set subcategoria = case
  when lower(coalesce(categoria, '')) in ('clasico', 'clasicos') then 'pollo'
  when lower(coalesce(categoria, '')) in ('combo', 'combos') then 'combo'
  when lower(coalesce(nombre, '')) like '%espagueti%' then 'espagueti'
  when lower(coalesce(nombre, '')) like '%ensalada%' then 'ensalada'
  when lower(coalesce(nombre, '')) like '%salsa%' then 'salsa'
  when lower(coalesce(nombre, '')) like '%papa%' then 'papas_fritas'
  else subcategoria
end
where subcategoria is null;

create or replace function guardar_producto_admin(
    p_producto_id uuid default null,
    p_nombre text default null,
    p_descripcion text default null,
    p_precio decimal(10, 2) default null,
    p_categoria text default null,
    p_subcategoria text default null,ya 
    p_clave_inventario text default null,
    p_requiere_variante_3_4 boolean default false
)
returns productos
language plpgsql
security definer
set search_path = public
as $$
declare
    v_producto productos%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Debes iniciar sesion para realizar esta accion';
    end if;

    if not es_usuario_admin() then
        raise exception 'Solo un administrador puede modificar productos';
    end if;

    if coalesce(trim(p_nombre), '') = '' then
        raise exception 'El nombre del producto es obligatorio';
    end if;

    if p_precio is null or p_precio <= 0 then
        raise exception 'El precio debe ser mayor a cero';
    end if;

    if p_producto_id is null then
        insert into productos (
            nombre,
            descripcion,
            precio,
            categoria,
            subcategoria,
            clave_inventario,
            requiere_variante_3_4
        )
        values (
            trim(p_nombre),
            nullif(trim(coalesce(p_descripcion, '')), ''),
            p_precio,
            nullif(trim(coalesce(p_categoria, '')), ''),
            nullif(trim(coalesce(p_subcategoria, '')), ''),
            nullif(trim(coalesce(p_clave_inventario, '')), ''),
            coalesce(p_requiere_variante_3_4, false)
        )
        returning *
        into v_producto;
    else
        update productos
        set
            nombre = trim(p_nombre),
            descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
            precio = p_precio,
            categoria = nullif(trim(coalesce(p_categoria, '')), ''),
            subcategoria = nullif(trim(coalesce(p_subcategoria, '')), ''),
            clave_inventario = nullif(trim(coalesce(p_clave_inventario, '')), ''),
            requiere_variante_3_4 = coalesce(p_requiere_variante_3_4, false)
        where id = p_producto_id
        returning *
        into v_producto;

        if not found then
            raise exception 'No se encontro el producto solicitado';
        end if;
    end if;

    return v_producto;
end;
$$;
