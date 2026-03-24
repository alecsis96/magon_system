alter table public.productos
add column if not exists piezas_inventario integer;

update public.productos
set piezas_inventario = case
  when piezas_inventario is not null then piezas_inventario
  when clave_inventario = '1_pollo' then 10
  when clave_inventario = '3/4_pollo' then 7
  when clave_inventario = '1/2_pollo' then 5
  when clave_inventario in ('1_PIEZA', '1_pieza') then 1
  when clave_inventario = 'combo_papas' then 10
  else null
end
where piezas_inventario is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_piezas_inventario_check'
  ) then
    alter table public.productos
    add constraint productos_piezas_inventario_check
    check (piezas_inventario is null or piezas_inventario >= 0);
  end if;
end
$$;

drop function if exists public.guardar_producto_admin(uuid, text, text, numeric, text, text, boolean);
drop function if exists public.guardar_producto_admin(uuid, text, text, numeric, text, text, text, boolean);

create or replace function public.guardar_producto_admin(
    p_producto_id uuid default null,
    p_nombre text default null,
    p_descripcion text default null,
    p_precio decimal(10, 2) default null,
    p_categoria text default null,
    p_subcategoria text default null,
    p_piezas_inventario integer default null,
    p_requiere_variante_3_4 boolean default false
)
returns public.productos
language plpgsql
security definer
set search_path = public
as $$
declare
    v_producto public.productos%rowtype;
    v_piezas_inventario integer;
begin
    if auth.uid() is null then
        raise exception 'Debes iniciar sesion para realizar esta accion';
    end if;

    if not public.es_usuario_admin() then
        raise exception 'Solo un administrador puede modificar productos';
    end if;

    if coalesce(trim(p_nombre), '') = '' then
        raise exception 'El nombre del producto es obligatorio';
    end if;

    if p_precio is null or p_precio <= 0 then
        raise exception 'El precio debe ser mayor a cero';
    end if;

    if p_piezas_inventario is not null and p_piezas_inventario < 0 then
        raise exception 'Las piezas a descontar no pueden ser negativas';
    end if;

    v_piezas_inventario := case
      when p_piezas_inventario is null or p_piezas_inventario <= 0 then null
      else p_piezas_inventario
    end;

    if p_producto_id is null then
        insert into public.productos (
            nombre,
            descripcion,
            precio,
            categoria,
            subcategoria,
            clave_inventario,
            piezas_inventario,
            requiere_variante_3_4
        )
        values (
            trim(p_nombre),
            nullif(trim(coalesce(p_descripcion, '')), ''),
            p_precio,
            nullif(trim(coalesce(p_categoria, '')), ''),
            nullif(trim(coalesce(p_subcategoria, '')), ''),
            null,
            v_piezas_inventario,
            coalesce(p_requiere_variante_3_4, false) and v_piezas_inventario = 7
        )
        returning * into v_producto;
    else
        update public.productos
        set
            nombre = trim(p_nombre),
            descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
            precio = p_precio,
            categoria = nullif(trim(coalesce(p_categoria, '')), ''),
            subcategoria = nullif(trim(coalesce(p_subcategoria, '')), ''),
            clave_inventario = null,
            piezas_inventario = v_piezas_inventario,
            requiere_variante_3_4 = coalesce(p_requiere_variante_3_4, false) and v_piezas_inventario = 7
        where id = p_producto_id
        returning * into v_producto;

        if not found then
            raise exception 'No se encontro el producto solicitado';
        end if;
    end if;

    return v_producto;
end;
$$;
