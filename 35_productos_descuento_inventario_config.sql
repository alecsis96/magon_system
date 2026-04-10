alter table public.productos
add column if not exists modo_descuento_inventario text not null default 'fijo';

alter table public.productos
add column if not exists piezas_a_seleccionar integer;

alter table public.productos
add column if not exists piezas_permitidas jsonb default null;

alter table public.productos
add column if not exists permite_repetir_piezas boolean not null default true;

alter table public.productos
add column if not exists desglose_fijo jsonb default null;

create or replace function public.es_piezas_permitidas_valido(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select
    p_value is null
    or (
      jsonb_typeof(p_value) = 'array'
      and not exists (
        select 1
        from jsonb_array_elements_text(p_value) as pieza
        where pieza not in ('alas', 'piernas', 'muslos', 'pechugas_grandes', 'pechugas_chicas')
      )
    );
$$;

create or replace function public.es_desglose_fijo_valido(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select
    p_value is null
    or (
      jsonb_typeof(p_value) = 'object'
      and not exists (
        select 1
        from jsonb_each(p_value) as kv
        where kv.key not in ('alas', 'piernas', 'muslos', 'pechugas_grandes', 'pechugas_chicas')
          or jsonb_typeof(kv.value) <> 'number'
          or (kv.value::text)::numeric < 0
          or (kv.value::text)::numeric <> trunc((kv.value::text)::numeric)
      )
    );
$$;

create or replace function public.suma_desglose_fijo(p_value jsonb)
returns integer
language sql
immutable
as $$
  select coalesce(sum((value::text)::integer), 0)
  from jsonb_each(coalesce(p_value, '{}'::jsonb));
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_modo_descuento_inventario_check'
  ) then
    alter table public.productos
    add constraint productos_modo_descuento_inventario_check
    check (modo_descuento_inventario in ('fijo', 'manual', 'fijo_por_pieza'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_piezas_a_seleccionar_check'
  ) then
    alter table public.productos
    add constraint productos_piezas_a_seleccionar_check
    check (piezas_a_seleccionar is null or piezas_a_seleccionar >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_piezas_permitidas_check'
  ) then
    alter table public.productos
    add constraint productos_piezas_permitidas_check
    check (public.es_piezas_permitidas_valido(piezas_permitidas));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_desglose_fijo_check'
  ) then
    alter table public.productos
    add constraint productos_desglose_fijo_check
    check (public.es_desglose_fijo_valido(desglose_fijo));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_configuracion_modo_check'
  ) then
    alter table public.productos
    add constraint productos_configuracion_modo_check
    check (
      (modo_descuento_inventario = 'manual' and piezas_a_seleccionar is not null)
      or (modo_descuento_inventario <> 'manual' and piezas_a_seleccionar is null)
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_desglose_fijo_por_pieza_check'
  ) then
    alter table public.productos
    add constraint productos_desglose_fijo_por_pieza_check
    check (
      modo_descuento_inventario <> 'fijo_por_pieza'
      or (
        desglose_fijo is not null
        and public.es_desglose_fijo_valido(desglose_fijo)
        and public.suma_desglose_fijo(desglose_fijo) > 0
      )
    );
  end if;
end
$$;

update public.productos
set
  modo_descuento_inventario = coalesce(modo_descuento_inventario, 'fijo'),
  permite_repetir_piezas = coalesce(permite_repetir_piezas, true)
where modo_descuento_inventario is null
   or permite_repetir_piezas is null;

update public.productos
set
  modo_descuento_inventario = 'manual',
  piezas_a_seleccionar = piezas_inventario,
  piezas_permitidas = coalesce(
    piezas_permitidas,
    '["alas", "piernas", "muslos", "pechugas_grandes", "pechugas_chicas"]'::jsonb
  ),
  permite_repetir_piezas = coalesce(permite_repetir_piezas, true),
  desglose_fijo = null
where piezas_inventario in (1, 2)
  and coalesce(modo_descuento_inventario, 'fijo') = 'fijo';

update public.productos
set
  modo_descuento_inventario = 'fijo_por_pieza',
  piezas_a_seleccionar = null,
  piezas_permitidas = null,
  permite_repetir_piezas = true,
  desglose_fijo = '{"pechugas_chicas": 1}'::jsonb,
  piezas_inventario = coalesce(nullif(piezas_inventario, 0), 1)
where (
    lower(coalesce(nombre, '')) like '%boneless%'
    or lower(coalesce(nombre, '')) like '%sin hueso%'
    or lower(coalesce(nombre, '')) like '%pechuga chica%'
  )
  and coalesce(modo_descuento_inventario, 'fijo') <> 'manual';

update public.productos
set desglose_fijo = '{"alas": 2, "piernas": 2, "muslos": 2, "pechugas_grandes": 2, "pechugas_chicas": 2}'::jsonb
where coalesce(modo_descuento_inventario, 'fijo') = 'fijo'
  and (clave_inventario = '1_pollo' or clave_inventario = 'combo_papas')
  and desglose_fijo is null;

update public.productos
set desglose_fijo = '{"alas": 1, "piernas": 1, "muslos": 1, "pechugas_grandes": 1, "pechugas_chicas": 1}'::jsonb
where coalesce(modo_descuento_inventario, 'fijo') = 'fijo'
  and clave_inventario = '1/2_pollo'
  and desglose_fijo is null;

drop function if exists public.guardar_producto_admin(uuid, text, text, numeric, text, text, integer, boolean);

create or replace function public.guardar_producto_admin(
    p_producto_id uuid default null,
    p_nombre text default null,
    p_descripcion text default null,
    p_precio decimal(10, 2) default null,
    p_categoria text default null,
    p_subcategoria text default null,
    p_piezas_inventario integer default null,
    p_requiere_variante_3_4 boolean default false,
    p_modo_descuento_inventario text default 'fijo',
    p_piezas_a_seleccionar integer default null,
    p_piezas_permitidas jsonb default null,
    p_permite_repetir_piezas boolean default true,
    p_desglose_fijo jsonb default null
)
returns public.productos
language plpgsql
security definer
set search_path = public
as $$
declare
    v_producto public.productos%rowtype;
    v_piezas_inventario integer;
    v_modo_descuento text;
    v_piezas_a_seleccionar integer;
    v_piezas_permitidas jsonb;
    v_permite_repetir_piezas boolean;
    v_desglose_fijo jsonb;
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

    v_modo_descuento := coalesce(trim(lower(p_modo_descuento_inventario)), 'fijo');

    if v_modo_descuento not in ('fijo', 'manual', 'fijo_por_pieza') then
      raise exception 'Modo de descuento de inventario invalido: %', v_modo_descuento;
    end if;

    if v_modo_descuento = 'manual' then
      if p_piezas_a_seleccionar is null or p_piezas_a_seleccionar < 1 then
        raise exception 'En modo manual debes indicar piezas_a_seleccionar >= 1';
      end if;

      v_piezas_a_seleccionar := p_piezas_a_seleccionar;
      v_piezas_permitidas := p_piezas_permitidas;
      v_permite_repetir_piezas := coalesce(p_permite_repetir_piezas, true);
      v_desglose_fijo := null;

      if not public.es_piezas_permitidas_valido(v_piezas_permitidas) then
        raise exception 'La lista de piezas_permitidas es invalida';
      end if;

      if v_piezas_permitidas is not null and jsonb_array_length(v_piezas_permitidas) = 0 then
        raise exception 'En modo manual no puedes guardar piezas_permitidas vacio';
      end if;

      if not v_permite_repetir_piezas
        and v_piezas_permitidas is not null
        and p_piezas_a_seleccionar > jsonb_array_length(v_piezas_permitidas) then
        raise exception 'Con repeticion desactivada, piezas_a_seleccionar no puede exceder piezas_permitidas';
      end if;
    elsif v_modo_descuento = 'fijo_por_pieza' then
      v_piezas_a_seleccionar := null;
      v_piezas_permitidas := null;
      v_permite_repetir_piezas := true;
      v_desglose_fijo := p_desglose_fijo;

      if not public.es_desglose_fijo_valido(v_desglose_fijo)
        or public.suma_desglose_fijo(v_desglose_fijo) <= 0 then
        raise exception 'En modo fijo_por_pieza debes indicar un desglose_fijo valido con al menos 1 pieza';
      end if;
    else
      v_piezas_a_seleccionar := null;
      v_piezas_permitidas := null;
      v_permite_repetir_piezas := true;
      v_desglose_fijo := p_desglose_fijo;

      if not public.es_desglose_fijo_valido(v_desglose_fijo) then
        raise exception 'El desglose_fijo no tiene un formato valido';
      end if;
    end if;

    if p_producto_id is null then
        insert into public.productos (
            nombre,
            descripcion,
            precio,
            categoria,
            subcategoria,
            clave_inventario,
            piezas_inventario,
            requiere_variante_3_4,
            modo_descuento_inventario,
            piezas_a_seleccionar,
            piezas_permitidas,
            permite_repetir_piezas,
            desglose_fijo
        )
        values (
            trim(p_nombre),
            nullif(trim(coalesce(p_descripcion, '')), ''),
            p_precio,
            nullif(trim(coalesce(p_categoria, '')), ''),
            nullif(trim(coalesce(p_subcategoria, '')), ''),
            null,
            v_piezas_inventario,
            coalesce(p_requiere_variante_3_4, false) and v_piezas_inventario = 7,
            v_modo_descuento,
            v_piezas_a_seleccionar,
            v_piezas_permitidas,
            v_permite_repetir_piezas,
            v_desglose_fijo
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
            requiere_variante_3_4 = coalesce(p_requiere_variante_3_4, false) and v_piezas_inventario = 7,
            modo_descuento_inventario = v_modo_descuento,
            piezas_a_seleccionar = v_piezas_a_seleccionar,
            piezas_permitidas = v_piezas_permitidas,
            permite_repetir_piezas = v_permite_repetir_piezas,
            desglose_fijo = v_desglose_fijo
        where id = p_producto_id
        returning * into v_producto;

        if not found then
            raise exception 'No se encontro el producto solicitado';
        end if;
    end if;

    return v_producto;
end;
$$;
