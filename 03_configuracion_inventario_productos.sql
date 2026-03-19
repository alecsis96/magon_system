ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS clave_inventario VARCHAR(50);

ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS requiere_variante_3_4 BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE productos
SET
    clave_inventario = '1_pollo',
    requiere_variante_3_4 = FALSE
WHERE LOWER(nombre) LIKE '%1 pollo%';

UPDATE productos
SET
    clave_inventario = '3/4_pollo',
    requiere_variante_3_4 = TRUE
WHERE LOWER(nombre) LIKE '%3/4 pollo%';

UPDATE productos
SET
    clave_inventario = '1/2_pollo',
    requiere_variante_3_4 = FALSE
WHERE LOWER(nombre) LIKE '%1/2 pollo%'
   OR LOWER(nombre) LIKE '%medio pollo%';

UPDATE productos
SET
    clave_inventario = 'combo_papas',
    requiere_variante_3_4 = FALSE
WHERE LOWER(nombre) LIKE '%combo papas%';
