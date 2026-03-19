CREATE TABLE IF NOT EXISTS egresos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    categoria VARCHAR(80) NOT NULL,
    concepto TEXT NOT NULL,
    monto DECIMAL(10, 2) NOT NULL CHECK (monto > 0),
    creado_por UUID REFERENCES auth.users(id),
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_egresos_fecha
    ON egresos (fecha DESC);

CREATE INDEX IF NOT EXISTS idx_egresos_categoria
    ON egresos (categoria);

ALTER TABLE egresos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS egresos_select_admin ON egresos;
CREATE POLICY egresos_select_admin
ON egresos
FOR SELECT
TO authenticated
USING (es_usuario_admin());

DROP POLICY IF EXISTS egresos_insert_admin ON egresos;
CREATE POLICY egresos_insert_admin
ON egresos
FOR INSERT
TO authenticated
WITH CHECK (es_usuario_admin());

DROP POLICY IF EXISTS egresos_update_admin ON egresos;
CREATE POLICY egresos_update_admin
ON egresos
FOR UPDATE
TO authenticated
USING (es_usuario_admin())
WITH CHECK (es_usuario_admin());

DROP POLICY IF EXISTS egresos_delete_admin ON egresos;
CREATE POLICY egresos_delete_admin
ON egresos
FOR DELETE
TO authenticated
USING (es_usuario_admin());
