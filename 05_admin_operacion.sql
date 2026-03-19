CREATE TABLE IF NOT EXISTS admin_usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    nombre TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE admin_usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_usuarios_select_self ON admin_usuarios;
CREATE POLICY admin_usuarios_select_self
ON admin_usuarios
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION es_usuario_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM admin_usuarios
        WHERE id = auth.uid()
          AND activo = TRUE
    );
END;
$$;

CREATE OR REPLACE FUNCTION reabrir_inventario_dia(
    p_inventory_id UUID
)
RETURNS inventario_diario
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inventory inventario_diario%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesion para realizar esta accion';
    END IF;

    IF NOT es_usuario_admin() THEN
        RAISE EXCEPTION 'Solo un administrador puede reabrir el dia';
    END IF;

    UPDATE inventario_diario
    SET
        conteo_fisico_cierre = NULL,
        diferencia_cierre = NULL,
        notas_cierre = NULL,
        cerrado_en = NULL
    WHERE id = p_inventory_id
    RETURNING *
    INTO v_inventory;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontro el inventario solicitado';
    END IF;

    RETURN v_inventory;
END;
$$;

CREATE OR REPLACE FUNCTION guardar_producto_admin(
    p_producto_id UUID DEFAULT NULL,
    p_nombre TEXT DEFAULT NULL,
    p_descripcion TEXT DEFAULT NULL,
    p_precio DECIMAL(10, 2) DEFAULT NULL,
    p_categoria TEXT DEFAULT NULL,
    p_clave_inventario TEXT DEFAULT NULL,
    p_requiere_variante_3_4 BOOLEAN DEFAULT FALSE
)
RETURNS productos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_producto productos%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesion para realizar esta accion';
    END IF;

    IF NOT es_usuario_admin() THEN
        RAISE EXCEPTION 'Solo un administrador puede modificar productos';
    END IF;

    IF COALESCE(TRIM(p_nombre), '') = '' THEN
        RAISE EXCEPTION 'El nombre del producto es obligatorio';
    END IF;

    IF p_precio IS NULL OR p_precio <= 0 THEN
        RAISE EXCEPTION 'El precio debe ser mayor a cero';
    END IF;

    IF p_producto_id IS NULL THEN
        INSERT INTO productos (
            nombre,
            descripcion,
            precio,
            categoria,
            clave_inventario,
            requiere_variante_3_4
        )
        VALUES (
            TRIM(p_nombre),
            NULLIF(TRIM(COALESCE(p_descripcion, '')), ''),
            p_precio,
            NULLIF(TRIM(COALESCE(p_categoria, '')), ''),
            NULLIF(TRIM(COALESCE(p_clave_inventario, '')), ''),
            COALESCE(p_requiere_variante_3_4, FALSE)
        )
        RETURNING *
        INTO v_producto;
    ELSE
        UPDATE productos
        SET
            nombre = TRIM(p_nombre),
            descripcion = NULLIF(TRIM(COALESCE(p_descripcion, '')), ''),
            precio = p_precio,
            categoria = NULLIF(TRIM(COALESCE(p_categoria, '')), ''),
            clave_inventario = NULLIF(TRIM(COALESCE(p_clave_inventario, '')), ''),
            requiere_variante_3_4 = COALESCE(p_requiere_variante_3_4, FALSE)
        WHERE id = p_producto_id
        RETURNING *
        INTO v_producto;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No se encontro el producto solicitado';
        END IF;
    END IF;

    RETURN v_producto;
END;
$$;
