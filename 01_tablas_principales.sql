-- Tabla del Menú (Productos)
CREATE TABLE productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio DECIMAL(10, 2) NOT NULL,
    categoria VARCHAR(50) -- ej. 'Clasico', 'Combo', 'Extra'
);

-- Tabla de Clientes (Directorio para el Repartidor)
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telefono VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    url_foto_fachada TEXT,
    latitud DECIMAL(10, 8),
    longitud DECIMAL(11, 8),
    notas_entrega TEXT
);

-- Tabla de Control Diario (Inventario y Mermas)
CREATE TABLE inventario_diario (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
    pollos_ingresados INT NOT NULL DEFAULT 0,
    pollos_vendidos INT NOT NULL DEFAULT 0,
    mermas_quemados INT DEFAULT 0,
    mermas_caidos INT DEFAULT 0,
    stock_final INT GENERATED ALWAYS AS (pollos_ingresados - pollos_vendidos - mermas_quemados - mermas_caidos) STORED
);

-- Tabla de Pedidos (El corazón de la operación)
CREATE TABLE pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes(id),
    estado VARCHAR(50) DEFAULT 'en_preparacion', -- 'en_preparacion', 'en_camino', 'entregado'
    tipo_pedido VARCHAR(50) NOT NULL, -- 'mostrador', 'domicilio'
    total DECIMAL(10, 2) NOT NULL,
    metodo_pago VARCHAR(50), -- 'efectivo', 'transferencia'
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE pedidos 
ADD COLUMN estado_pago VARCHAR(50) DEFAULT 'pendiente';

-- 1. Agregamos la columna de lo que sobró de ayer
ALTER TABLE inventario_diario ADD COLUMN stock_anterior INT DEFAULT 0;

-- 2. Renombramos la columna vieja para que tenga más sentido
ALTER TABLE inventario_diario RENAME COLUMN pollos_ingresados TO nuevos_ingresos;

-- 3. Borramos la fórmula vieja del stock final
ALTER TABLE inventario_diario DROP COLUMN stock_final;

-- 4. Creamos la nueva fórmula exacta: (Lo de ayer + Lo de hoy - Ventas - Mermas)
ALTER TABLE inventario_diario ADD COLUMN stock_final INT GENERATED ALWAYS AS (stock_anterior + nuevos_ingresos - pollos_vendidos - mermas_quemados - mermas_caidos) STORED;

-- 1. Agregamos las ventas detalladas por pieza
ALTER TABLE inventario_diario 
ADD COLUMN ventas_alas INT DEFAULT 0,
ADD COLUMN ventas_piernas INT DEFAULT 0,
ADD COLUMN ventas_muslos INT DEFAULT 0,
ADD COLUMN ventas_pechugas_g INT DEFAULT 0,
ADD COLUMN ventas_pechugas_c INT DEFAULT 0;

-- 2. Agregamos las mermas detalladas por pieza
ALTER TABLE inventario_diario 
ADD COLUMN mermas_alas INT DEFAULT 0,
ADD COLUMN mermas_piernas INT DEFAULT 0,
ADD COLUMN mermas_muslos INT DEFAULT 0,
ADD COLUMN mermas_pechugas_g INT DEFAULT 0,
ADD COLUMN mermas_pechugas_c INT DEFAULT 0;