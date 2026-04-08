ALTER TABLE egresos
ADD COLUMN IF NOT EXISTS cancelado BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT,
ADD COLUMN IF NOT EXISTS cancelado_en TIMESTAMP,
ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS medio_salida VARCHAR(20) NOT NULL DEFAULT 'efectivo';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'egresos_medio_salida_check'
    ) THEN
        ALTER TABLE egresos
        ADD CONSTRAINT egresos_medio_salida_check
        CHECK (medio_salida IN ('efectivo', 'transferencia'));
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS egreso_plantillas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(120) NOT NULL,
    categoria VARCHAR(80) NOT NULL,
    concepto_base TEXT NOT NULL,
    monto_sugerido DECIMAL(10, 2) CHECK (monto_sugerido > 0),
    medio_salida VARCHAR(20) NOT NULL DEFAULT 'efectivo' CHECK (medio_salida IN ('efectivo', 'transferencia')),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    orden INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    creado_por UUID REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_egreso_plantillas_nombre
    ON egreso_plantillas (nombre);

CREATE INDEX IF NOT EXISTS idx_egreso_plantillas_orden
    ON egreso_plantillas (activo DESC, orden ASC, creado_en DESC);

ALTER TABLE egreso_plantillas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS egreso_plantillas_select_admin ON egreso_plantillas;
CREATE POLICY egreso_plantillas_select_admin
ON egreso_plantillas
FOR SELECT
TO authenticated
USING (es_usuario_admin());

DROP POLICY IF EXISTS egreso_plantillas_insert_admin ON egreso_plantillas;
CREATE POLICY egreso_plantillas_insert_admin
ON egreso_plantillas
FOR INSERT
TO authenticated
WITH CHECK (es_usuario_admin());

DROP POLICY IF EXISTS egreso_plantillas_update_admin ON egreso_plantillas;
CREATE POLICY egreso_plantillas_update_admin
ON egreso_plantillas
FOR UPDATE
TO authenticated
USING (es_usuario_admin())
WITH CHECK (es_usuario_admin());

DROP POLICY IF EXISTS egreso_plantillas_delete_admin ON egreso_plantillas;
CREATE POLICY egreso_plantillas_delete_admin
ON egreso_plantillas
FOR DELETE
TO authenticated
USING (es_usuario_admin());

INSERT INTO egreso_plantillas (nombre, categoria, concepto_base, monto_sugerido, medio_salida, orden)
VALUES
    ('Pollo', 'Proveedor', 'Compra de pollo para produccion', NULL, 'efectivo', 10),
    ('Pure', 'Proveedor', 'Compra de pure para cocina', NULL, 'efectivo', 20),
    ('Verduras', 'Proveedor', 'Compra de verduras frescas', NULL, 'efectivo', 30),
    ('Media crema', 'Proveedor', 'Compra de media crema', NULL, 'efectivo', 40),
    ('Aceite', 'Proveedor', 'Compra de aceite para freidoras', NULL, 'efectivo', 50),
    ('Gas LP', 'Servicios', 'Recarga de gas LP', NULL, 'efectivo', 60),
    ('Bolsas y empaques', 'Insumos', 'Compra de bolsas y empaques', NULL, 'efectivo', 70),
    ('Limpieza', 'Mantenimiento', 'Insumos de limpieza', NULL, 'transferencia', 80)
ON CONFLICT (nombre) DO UPDATE
SET
    categoria = EXCLUDED.categoria,
    concepto_base = EXCLUDED.concepto_base,
    monto_sugerido = EXCLUDED.monto_sugerido,
    medio_salida = EXCLUDED.medio_salida,
    orden = EXCLUDED.orden;

CREATE TABLE IF NOT EXISTS cierres_caja (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha DATE NOT NULL,
    fondo_inicial DECIMAL(10, 2) NOT NULL DEFAULT 0,
    conteo_denominaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
    contado_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    esperado_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    diferencia DECIMAL(10, 2) NOT NULL DEFAULT 0,
    notas TEXT,
    cerrado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cerrado_por UUID REFERENCES auth.users(id),
    CONSTRAINT cierres_caja_fecha_key UNIQUE (fecha)
);

ALTER TABLE cierres_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cierres_caja_select_admin ON cierres_caja;
CREATE POLICY cierres_caja_select_admin
ON cierres_caja
FOR SELECT
TO authenticated
USING (es_usuario_admin());

DROP POLICY IF EXISTS cierres_caja_insert_admin ON cierres_caja;
CREATE POLICY cierres_caja_insert_admin
ON cierres_caja
FOR INSERT
TO authenticated
WITH CHECK (es_usuario_admin());

DROP POLICY IF EXISTS cierres_caja_update_admin ON cierres_caja;
CREATE POLICY cierres_caja_update_admin
ON cierres_caja
FOR UPDATE
TO authenticated
USING (es_usuario_admin())
WITH CHECK (es_usuario_admin());

DROP POLICY IF EXISTS cierres_caja_delete_admin ON cierres_caja;
CREATE POLICY cierres_caja_delete_admin
ON cierres_caja
FOR DELETE
TO authenticated
USING (es_usuario_admin());
