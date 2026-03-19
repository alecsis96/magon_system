-- Tabla de detalle de pedido para auditoria exacta de la venta
CREATE TABLE IF NOT EXISTS pedido_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES productos(id),
    producto_codigo VARCHAR(100) NOT NULL,
    producto_nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    cantidad INT NOT NULL DEFAULT 1,
    precio_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    variante_3_4 VARCHAR(50),
    merma_descripcion TEXT,
    alas INT NOT NULL DEFAULT 0,
    piernas INT NOT NULL DEFAULT 0,
    muslos INT NOT NULL DEFAULT 0,
    pechugas_grandes INT NOT NULL DEFAULT 0,
    pechugas_chicas INT NOT NULL DEFAULT 0,
    merma_alas INT NOT NULL DEFAULT 0,
    merma_piernas INT NOT NULL DEFAULT 0,
    merma_muslos INT NOT NULL DEFAULT 0,
    merma_pechugas_grandes INT NOT NULL DEFAULT 0,
    merma_pechugas_chicas INT NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pedido_detalles_pedido_id
    ON pedido_detalles (pedido_id);

ALTER TABLE inventario_diario
    DROP COLUMN IF EXISTS stock_final;

-- Los campos generales pasan a equivalentes de pollo, no a conteos enteros
ALTER TABLE inventario_diario
    ALTER COLUMN pollos_vendidos TYPE DECIMAL(10, 2)
    USING pollos_vendidos::DECIMAL(10, 2);

ALTER TABLE inventario_diario
    ALTER COLUMN mermas_quemados TYPE DECIMAL(10, 2)
    USING mermas_quemados::DECIMAL(10, 2);

ALTER TABLE inventario_diario
    ALTER COLUMN mermas_caidos TYPE DECIMAL(10, 2)
    USING mermas_caidos::DECIMAL(10, 2);

ALTER TABLE inventario_diario
    ADD COLUMN stock_final DECIMAL(10, 2) GENERATED ALWAYS AS (
        stock_anterior + nuevos_ingresos - pollos_vendidos - mermas_quemados - mermas_caidos
    ) STORED;

CREATE OR REPLACE FUNCTION registrar_venta(
    p_total DECIMAL(10, 2),
    p_tipo_pedido VARCHAR(50),
    p_metodo_pago VARCHAR(50),
    p_estado_pago VARCHAR(50),
    p_cliente_id UUID DEFAULT NULL,
    p_estado VARCHAR(50) DEFAULT NULL,
    p_fecha DATE DEFAULT CURRENT_DATE,
    p_detalles JSONB DEFAULT '[]'::JSONB
)
RETURNS inventario_diario
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inventory inventario_diario%ROWTYPE;
    v_updated_inventory inventario_diario%ROWTYPE;
    v_pedido_id UUID;
    v_detalle JSONB;
    v_ventas_alas INT := 0;
    v_ventas_piernas INT := 0;
    v_ventas_muslos INT := 0;
    v_ventas_pechugas_g INT := 0;
    v_ventas_pechugas_c INT := 0;
    v_mermas_alas INT := 0;
    v_mermas_piernas INT := 0;
    v_mermas_muslos INT := 0;
    v_mermas_pechugas_g INT := 0;
    v_mermas_pechugas_c INT := 0;
    v_pollos_vendidos DECIMAL(10, 2);
    v_mermas_quemadas DECIMAL(10, 2);
BEGIN
    IF p_detalles IS NULL
       OR jsonb_typeof(p_detalles) <> 'array'
       OR jsonb_array_length(p_detalles) = 0 THEN
        RAISE EXCEPTION 'La venta debe incluir al menos un detalle';
    END IF;

    SELECT *
    INTO v_inventory
    FROM inventario_diario
    WHERE fecha = p_fecha
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventario de hoy no iniciado';
    END IF;

    INSERT INTO pedidos (
        cliente_id,
        estado,
        tipo_pedido,
        total,
        metodo_pago,
        estado_pago
    )
    VALUES (
        p_cliente_id,
        COALESCE(p_estado, 'en_preparacion'),
        p_tipo_pedido,
        p_total,
        p_metodo_pago,
        p_estado_pago
    )
    RETURNING id INTO v_pedido_id;

    FOR v_detalle IN
        SELECT value
        FROM jsonb_array_elements(p_detalles)
    LOOP
        v_ventas_alas := v_ventas_alas + COALESCE((v_detalle->>'alas')::INT, 0);
        v_ventas_piernas := v_ventas_piernas + COALESCE((v_detalle->>'piernas')::INT, 0);
        v_ventas_muslos := v_ventas_muslos + COALESCE((v_detalle->>'muslos')::INT, 0);
        v_ventas_pechugas_g := v_ventas_pechugas_g + COALESCE((v_detalle->>'pechugas_grandes')::INT, 0);
        v_ventas_pechugas_c := v_ventas_pechugas_c + COALESCE((v_detalle->>'pechugas_chicas')::INT, 0);

        v_mermas_alas := v_mermas_alas + COALESCE((v_detalle->>'merma_alas')::INT, 0);
        v_mermas_piernas := v_mermas_piernas + COALESCE((v_detalle->>'merma_piernas')::INT, 0);
        v_mermas_muslos := v_mermas_muslos + COALESCE((v_detalle->>'merma_muslos')::INT, 0);
        v_mermas_pechugas_g := v_mermas_pechugas_g + COALESCE((v_detalle->>'merma_pechugas_grandes')::INT, 0);
        v_mermas_pechugas_c := v_mermas_pechugas_c + COALESCE((v_detalle->>'merma_pechugas_chicas')::INT, 0);

        INSERT INTO pedido_detalles (
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
        VALUES (
            v_pedido_id,
            NULLIF(v_detalle->>'producto_uuid', '')::UUID,
            COALESCE(v_detalle->>'producto_codigo', 'sin_codigo'),
            COALESCE(v_detalle->>'producto_nombre', 'Producto'),
            v_detalle->>'descripcion',
            COALESCE((v_detalle->>'cantidad')::INT, 1),
            COALESCE((v_detalle->>'precio_unitario')::DECIMAL(10, 2), 0),
            COALESCE((v_detalle->>'subtotal')::DECIMAL(10, 2), 0),
            NULLIF(v_detalle->>'variante_3_4', ''),
            NULLIF(v_detalle->>'merma_descripcion', ''),
            COALESCE((v_detalle->>'alas')::INT, 0),
            COALESCE((v_detalle->>'piernas')::INT, 0),
            COALESCE((v_detalle->>'muslos')::INT, 0),
            COALESCE((v_detalle->>'pechugas_grandes')::INT, 0),
            COALESCE((v_detalle->>'pechugas_chicas')::INT, 0),
            COALESCE((v_detalle->>'merma_alas')::INT, 0),
            COALESCE((v_detalle->>'merma_piernas')::INT, 0),
            COALESCE((v_detalle->>'merma_muslos')::INT, 0),
            COALESCE((v_detalle->>'merma_pechugas_grandes')::INT, 0),
            COALESCE((v_detalle->>'merma_pechugas_chicas')::INT, 0)
        );
    END LOOP;

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

    UPDATE inventario_diario
    SET
        pollos_vendidos = COALESCE(pollos_vendidos, 0) + v_pollos_vendidos,
        ventas_alas = COALESCE(ventas_alas, 0) + v_ventas_alas,
        ventas_piernas = COALESCE(ventas_piernas, 0) + v_ventas_piernas,
        ventas_muslos = COALESCE(ventas_muslos, 0) + v_ventas_muslos,
        ventas_pechugas_g = COALESCE(ventas_pechugas_g, 0) + v_ventas_pechugas_g,
        ventas_pechugas_c = COALESCE(ventas_pechugas_c, 0) + v_ventas_pechugas_c,
        mermas_quemados = COALESCE(mermas_quemados, 0) + v_mermas_quemadas,
        mermas_alas = COALESCE(mermas_alas, 0) + v_mermas_alas,
        mermas_piernas = COALESCE(mermas_piernas, 0) + v_mermas_piernas,
        mermas_muslos = COALESCE(mermas_muslos, 0) + v_mermas_muslos,
        mermas_pechugas_g = COALESCE(mermas_pechugas_g, 0) + v_mermas_pechugas_g,
        mermas_pechugas_c = COALESCE(mermas_pechugas_c, 0) + v_mermas_pechugas_c
    WHERE id = v_inventory.id
    RETURNING *
    INTO v_updated_inventory;

    RETURN v_updated_inventory;
END;
$$;
