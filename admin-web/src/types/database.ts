export type UUID = string;
export type ISODateString = string;
export type ISODateTimeString = string;
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type ProductoCategoria = "Clasico" | "Combo" | "Extra" | (string & {});
export type ProductoSubcategoria =
  | "pollo"
  | "combo"
  | "espagueti"
  | "ensalada"
  | "salsa"
  | "papas_fritas"
  | "otro"
  | (string & {});
export type PedidoEstado =
  | "en_preparacion"
  | "en_camino"
  | "entregado"
  | (string & {});
export type PedidoTipo = "mostrador" | "domicilio" | (string & {});
export type MetodoPago = "efectivo" | "transferencia" | (string & {});
export type MedioSalida = "efectivo" | "transferencia" | (string & {});
export type EstadoPago = "pendiente" | "pagado";
export type ModoDescuentoInventario =
  | "fijo"
  | "manual"
  | "fijo_por_pieza"
  | (string & {});
export type AuditoriaModulo =
  | "inventario"
  | "productos"
  | "pedidos"
  | "contabilidad"
  | "clientes"
  | "sistema";
export interface Producto extends Record<string, unknown> {
  id: UUID;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: ProductoCategoria | null;
  subcategoria: ProductoSubcategoria | null;
  clave_inventario: string | null;
  piezas_inventario: number | null;
  requiere_variante_3_4: boolean;
  modo_descuento_inventario: ModoDescuentoInventario;
  piezas_a_seleccionar: number | null;
  piezas_permitidas: Json | null;
  permite_repetir_piezas: boolean;
  desglose_fijo: Json | null;
}
export interface ProductoInsert extends Record<string, unknown> {
  id?: UUID;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  categoria?: ProductoCategoria | null;
  subcategoria?: ProductoSubcategoria | null;
  clave_inventario?: string | null;
  piezas_inventario?: number | null;
  requiere_variante_3_4?: boolean;
  modo_descuento_inventario?: ModoDescuentoInventario;
  piezas_a_seleccionar?: number | null;
  piezas_permitidas?: Json | null;
  permite_repetir_piezas?: boolean;
  desglose_fijo?: Json | null;
}
export interface ProductoUpdate extends Record<string, unknown> {
  id?: UUID;
  nombre?: string;
  descripcion?: string | null;
  precio?: number;
  categoria?: ProductoCategoria | null;
  subcategoria?: ProductoSubcategoria | null;
  clave_inventario?: string | null;
  piezas_inventario?: number | null;
  requiere_variante_3_4?: boolean;
  modo_descuento_inventario?: ModoDescuentoInventario;
  piezas_a_seleccionar?: number | null;
  piezas_permitidas?: Json | null;
  permite_repetir_piezas?: boolean;
  desglose_fijo?: Json | null;
}
export interface Cliente extends Record<string, unknown> {
  id: UUID;
  telefono: string;
  nombre: string;
  url_foto_fachada: string | null;
  foto_valida: boolean;
  latitud: number | null;
  longitud: number | null;
  direccion_habitual: string | null;
  referencias: string | null;
  notas_entrega: string | null;
}
export interface ClienteInsert extends Record<string, unknown> {
  id?: UUID;
  telefono: string;
  nombre: string;
  url_foto_fachada?: string | null;
  foto_valida?: boolean;
  latitud?: number | null;
  longitud?: number | null;
  direccion_habitual?: string | null;
  referencias?: string | null;
  notas_entrega?: string | null;
}
export interface ClienteUpdate extends Record<string, unknown> {
  id?: UUID;
  telefono?: string;
  nombre?: string;
  url_foto_fachada?: string | null;
  foto_valida?: boolean;
  latitud?: number | null;
  longitud?: number | null;
  direccion_habitual?: string | null;
  referencias?: string | null;
  notas_entrega?: string | null;
}
export interface InventarioDiario extends Record<string, unknown> {
  id: UUID;
  fecha: ISODateString;
  stock_anterior: number;
  nuevos_ingresos: number;
  pollos_vendidos: number;
  ajustes_admin: number;
  ajustes_alas: number;
  ajustes_piernas: number;
  ajustes_muslos: number;
  ajustes_pechugas_g: number;
  ajustes_pechugas_c: number;
  ventas_alas: number | null;
  ventas_piernas: number | null;
  ventas_muslos: number | null;
  ventas_pechugas_g: number | null;
  ventas_pechugas_c: number | null;
  mermas_quemados: number | null;
  mermas_caidos: number | null;
  mermas_alas: number | null;
  mermas_piernas: number | null;
  mermas_muslos: number | null;
  mermas_pechugas_g: number | null;
  mermas_pechugas_c: number | null;
  stock_alas: number;
  stock_piernas: number;
  stock_muslos: number;
  stock_pechugas_g: number;
  stock_pechugas_c: number;
  stock_final: number | null;
  conteo_fisico_cierre: number | null;
  diferencia_cierre: number | null;
  notas_cierre: string | null;
  cerrado_en: ISODateTimeString | null;
}
export interface InventarioDiarioInsert extends Record<string, unknown> {
  id?: UUID;
  fecha?: ISODateString;
  stock_anterior?: number;
  nuevos_ingresos?: number;
  pollos_vendidos?: number;
  ajustes_admin?: number;
  ajustes_alas?: number;
  ajustes_piernas?: number;
  ajustes_muslos?: number;
  ajustes_pechugas_g?: number;
  ajustes_pechugas_c?: number;
  ventas_alas?: number | null;
  ventas_piernas?: number | null;
  ventas_muslos?: number | null;
  ventas_pechugas_g?: number | null;
  ventas_pechugas_c?: number | null;
  mermas_quemados?: number | null;
  mermas_caidos?: number | null;
  mermas_alas?: number | null;
  mermas_piernas?: number | null;
  mermas_muslos?: number | null;
  mermas_pechugas_g?: number | null;
  mermas_pechugas_c?: number | null;
  stock_alas?: number;
  stock_piernas?: number;
  stock_muslos?: number;
  stock_pechugas_g?: number;
  stock_pechugas_c?: number;
  conteo_fisico_cierre?: number | null;
  diferencia_cierre?: number | null;
  notas_cierre?: string | null;
  cerrado_en?: ISODateTimeString | null;
}
export interface InventarioDiarioUpdate extends Record<string, unknown> {
  id?: UUID;
  fecha?: ISODateString;
  stock_anterior?: number;
  nuevos_ingresos?: number;
  pollos_vendidos?: number;
  ajustes_admin?: number;
  ajustes_alas?: number;
  ajustes_piernas?: number;
  ajustes_muslos?: number;
  ajustes_pechugas_g?: number;
  ajustes_pechugas_c?: number;
  ventas_alas?: number | null;
  ventas_piernas?: number | null;
  ventas_muslos?: number | null;
  ventas_pechugas_g?: number | null;
  ventas_pechugas_c?: number | null;
  mermas_quemados?: number | null;
  mermas_caidos?: number | null;
  mermas_alas?: number | null;
  mermas_piernas?: number | null;
  mermas_muslos?: number | null;
  mermas_pechugas_g?: number | null;
  mermas_pechugas_c?: number | null;
  stock_alas?: number;
  stock_piernas?: number;
  stock_muslos?: number;
  stock_pechugas_g?: number;
  stock_pechugas_c?: number;
  conteo_fisico_cierre?: number | null;
  diferencia_cierre?: number | null;
  notas_cierre?: string | null;
  cerrado_en?: ISODateTimeString | null;
}
export interface PedidoDetalle extends Record<string, unknown> {
  id: UUID;
  pedido_id: UUID;
  producto_id: UUID | null;
  producto_codigo: string;
  producto_nombre: string;
  descripcion: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  variante_3_4: string | null;
  merma_descripcion: string | null;
  alas: number;
  piernas: number;
  muslos: number;
  pechugas_grandes: number;
  pechugas_chicas: number;
  merma_alas: number;
  merma_piernas: number;
  merma_muslos: number;
  merma_pechugas_grandes: number;
  merma_pechugas_chicas: number;
  creado_en: ISODateTimeString;
}
export interface PedidoDetalleInsert extends Record<string, unknown> {
  id?: UUID;
  pedido_id: UUID;
  producto_id?: UUID | null;
  producto_codigo: string;
  producto_nombre: string;
  descripcion?: string | null;
  cantidad?: number;
  precio_unitario: number;
  subtotal: number;
  variante_3_4?: string | null;
  merma_descripcion?: string | null;
  alas?: number;
  piernas?: number;
  muslos?: number;
  pechugas_grandes?: number;
  pechugas_chicas?: number;
  merma_alas?: number;
  merma_piernas?: number;
  merma_muslos?: number;
  merma_pechugas_grandes?: number;
  merma_pechugas_chicas?: number;
  creado_en?: ISODateTimeString;
}
export interface PedidoDetalleUpdate extends Record<string, unknown> {
  id?: UUID;
  pedido_id?: UUID;
  producto_id?: UUID | null;
  producto_codigo?: string;
  producto_nombre?: string;
  descripcion?: string | null;
  cantidad?: number;
  precio_unitario?: number;
  subtotal?: number;
  variante_3_4?: string | null;
  merma_descripcion?: string | null;
  alas?: number;
  piernas?: number;
  muslos?: number;
  pechugas_grandes?: number;
  pechugas_chicas?: number;
  merma_alas?: number;
  merma_piernas?: number;
  merma_muslos?: number;
  merma_pechugas_grandes?: number;
  merma_pechugas_chicas?: number;
  creado_en?: ISODateTimeString;
}
export interface Pedido extends Record<string, unknown> {
  id: UUID;
  cliente_id: UUID | null;
  estado: PedidoEstado | null;
  tipo_pedido: PedidoTipo;
  total: number;
  metodo_pago: MetodoPago | null;
  fecha_creacion: ISODateTimeString | null;
  estado_pago: EstadoPago;
}
export interface PedidoInsert extends Record<string, unknown> {
  id?: UUID;
  cliente_id?: UUID | null;
  estado?: PedidoEstado | null;
  tipo_pedido: PedidoTipo;
  total: number;
  metodo_pago?: MetodoPago | null;
  fecha_creacion?: ISODateTimeString | null;
  estado_pago: EstadoPago;
}
export interface PedidoUpdate extends Record<string, unknown> {
  id?: UUID;
  cliente_id?: UUID | null;
  estado?: PedidoEstado | null;
  tipo_pedido?: PedidoTipo;
  total?: number;
  metodo_pago?: MetodoPago | null;
  fecha_creacion?: ISODateTimeString | null;
  estado_pago?: EstadoPago;
}
export interface InventarioMovimiento extends Record<string, unknown> {
  id: UUID;
  inventario_id: UUID;
  fecha: ISODateString;
  tipo_movimiento: string;
  subtipo: string | null;
  pieza: string | null;
  cantidad_equivalente: number;
  cantidad_piezas: number | null;
  motivo: string | null;
  registrado_por: string | null;
  creado_en: ISODateTimeString;
}
export interface InventarioMovimientoInsert extends Record<string, unknown> {
  id?: UUID;
  inventario_id: UUID;
  fecha: ISODateString;
  tipo_movimiento: string;
  subtipo?: string | null;
  pieza?: string | null;
  cantidad_equivalente?: number;
  cantidad_piezas?: number | null;
  motivo?: string | null;
  registrado_por?: string | null;
  creado_en?: ISODateTimeString;
}
export interface InventarioMovimientoUpdate extends Record<string, unknown> {
  id?: UUID;
  inventario_id?: UUID;
  fecha?: ISODateString;
  tipo_movimiento?: string;
  subtipo?: string | null;
  pieza?: string | null;
  cantidad_equivalente?: number;
  cantidad_piezas?: number | null;
  motivo?: string | null;
  registrado_por?: string | null;
  creado_en?: ISODateTimeString;
}
export interface Egreso extends Record<string, unknown> {
  id: UUID;
  fecha: ISODateString;
  categoria: string;
  concepto: string;
  monto: number;
  medio_salida: MedioSalida;
  cancelado: boolean;
  motivo_cancelacion: string | null;
  cancelado_en: ISODateTimeString | null;
  cancelado_por: UUID | null;
  creado_por: UUID | null;
  creado_en: ISODateTimeString;
}
export interface EgresoInsert extends Record<string, unknown> {
  id?: UUID;
  fecha?: ISODateString;
  categoria: string;
  concepto: string;
  monto: number;
  medio_salida?: MedioSalida;
  cancelado?: boolean;
  motivo_cancelacion?: string | null;
  cancelado_en?: ISODateTimeString | null;
  cancelado_por?: UUID | null;
  creado_por?: UUID | null;
  creado_en?: ISODateTimeString;
}
export interface EgresoUpdate extends Record<string, unknown> {
  id?: UUID;
  fecha?: ISODateString;
  categoria?: string;
  concepto?: string;
  monto?: number;
  medio_salida?: MedioSalida;
  cancelado?: boolean;
  motivo_cancelacion?: string | null;
  cancelado_en?: ISODateTimeString | null;
  cancelado_por?: UUID | null;
  creado_por?: UUID | null;
  creado_en?: ISODateTimeString;
}
export interface EgresoPlantilla extends Record<string, unknown> {
  id: UUID;
  nombre: string;
  categoria: string;
  concepto_base: string;
  monto_sugerido: number | null;
  medio_salida: MedioSalida;
  activo: boolean;
  orden: number;
  creado_en: ISODateTimeString;
  creado_por: UUID | null;
}
export interface EgresoPlantillaInsert extends Record<string, unknown> {
  id?: UUID;
  nombre: string;
  categoria: string;
  concepto_base: string;
  monto_sugerido?: number | null;
  medio_salida?: MedioSalida;
  activo?: boolean;
  orden?: number;
  creado_en?: ISODateTimeString;
  creado_por?: UUID | null;
}
export interface EgresoPlantillaUpdate extends Record<string, unknown> {
  id?: UUID;
  nombre?: string;
  categoria?: string;
  concepto_base?: string;
  monto_sugerido?: number | null;
  medio_salida?: MedioSalida;
  activo?: boolean;
  orden?: number;
  creado_en?: ISODateTimeString;
  creado_por?: UUID | null;
}
export interface CierreCaja extends Record<string, unknown> {
  id: UUID;
  fecha: ISODateString;
  fondo_inicial: number;
  conteo_denominaciones: Json;
  contado_total: number;
  esperado_total: number;
  diferencia: number;
  notas: string | null;
  cerrado_en: ISODateTimeString;
  cerrado_por: UUID | null;
}
export interface CierreCajaInsert extends Record<string, unknown> {
  id?: UUID;
  fecha: ISODateString;
  fondo_inicial?: number;
  conteo_denominaciones?: Json;
  contado_total?: number;
  esperado_total?: number;
  diferencia?: number;
  notas?: string | null;
  cerrado_en?: ISODateTimeString;
  cerrado_por?: UUID | null;
}
export interface CierreCajaUpdate extends Record<string, unknown> {
  id?: UUID;
  fecha?: ISODateString;
  fondo_inicial?: number;
  conteo_denominaciones?: Json;
  contado_total?: number;
  esperado_total?: number;
  diferencia?: number;
  notas?: string | null;
  cerrado_en?: ISODateTimeString;
  cerrado_por?: UUID | null;
}
export interface RepartidorPushToken extends Record<string, unknown> {
  id: UUID;
  expo_push_token: string;
  dispositivo_nombre: string | null;
  plataforma: string | null;
  activo: boolean;
  creado_en: ISODateTimeString | null;
  actualizado_en: ISODateTimeString | null;
}
export interface RepartidorPushTokenInsert extends Record<string, unknown> {
  id?: UUID;
  expo_push_token: string;
  dispositivo_nombre?: string | null;
  plataforma?: string | null;
  activo?: boolean;
  creado_en?: ISODateTimeString | null;
  actualizado_en?: ISODateTimeString | null;
}
export interface RepartidorPushTokenUpdate extends Record<string, unknown> {
  id?: UUID;
  expo_push_token?: string;
  dispositivo_nombre?: string | null;
  plataforma?: string | null;
  activo?: boolean;
  creado_en?: ISODateTimeString | null;
  actualizado_en?: ISODateTimeString | null;
}
export interface AuditoriaEvento extends Record<string, unknown> {
  id: UUID;
  creado_en: ISODateTimeString;
  actor_uid: UUID | null;
  actor_email: string | null;
  modulo: AuditoriaModulo | (string & {});
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: Json;
}
export interface AuditoriaEventoInsert extends Record<string, unknown> {
  id?: UUID;
  creado_en?: ISODateTimeString;
  actor_uid?: UUID | null;
  actor_email?: string | null;
  modulo: AuditoriaModulo | (string & {});
  accion: string;
  entidad: string;
  entidad_id?: string | null;
  detalle?: Json;
}
export interface AuditoriaEventoUpdate extends Record<string, unknown> {
  id?: UUID;
  creado_en?: ISODateTimeString;
  actor_uid?: UUID | null;
  actor_email?: string | null;
  modulo?: AuditoriaModulo | (string & {});
  accion?: string;
  entidad?: string;
  entidad_id?: string | null;
  detalle?: Json;
}
export interface RegistrarVentaPosResult extends Record<string, unknown> {
  pedido_id: UUID;
  folio: string | null;
  fecha_creacion: ISODateTimeString | null;
  total: number;
  tipo_pedido: PedidoTipo;
  metodo_pago: MetodoPago | null;
  estado_pago: EstadoPago;
  cliente_id: UUID | null;
  estado: PedidoEstado | null;
}
export interface PrintableOrderItemRpc extends Record<string, unknown> {
  detalle_id: UUID;
  pedido_id: UUID;
  producto_id: UUID | null;
  producto_codigo: string;
  producto_nombre: string;
  descripcion: string | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  variante_3_4: string | null;
  merma_descripcion: string | null;
  alas: number;
  piernas: number;
  muslos: number;
  pechugas_grandes: number;
  pechugas_chicas: number;
  merma_alas: number;
  merma_piernas: number;
  merma_muslos: number;
  merma_pechugas_grandes: number;
  merma_pechugas_chicas: number;
}
export interface PrintableOrderRpc extends Record<string, unknown> {
  pedido_id: UUID;
  folio: string | null;
  fecha_creacion: ISODateTimeString | null;
  estado: PedidoEstado | null;
  tipo_pedido: PedidoTipo;
  metodo_pago: MetodoPago | null;
  estado_pago: EstadoPago;
  total: number;
  cliente_id: UUID | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_impresion: string | null;
  items: PrintableOrderItemRpc[];
}
export interface EliminarPedidoAdminResult extends Record<string, unknown> {
  pedido_id: UUID;
  inventory_id: UUID | null;
  ok: boolean;
  reversion_inventario_aplicada?: boolean;
  motivo_reversion_inventario?: string | null;
  piezas_revertidas: {
    total: number;
    alas: number;
    piernas: number;
    muslos: number;
    pechugas_grandes: number;
    pechugas_chicas: number;
  };
}
export interface ClienteFrecuenciaMensualRpc extends Record<string, unknown> {
  cliente_id: UUID;
  nombre: string;
  telefono: string;
  pedidos_mes: number;
  total_mes: number;
  ultimo_pedido_en: ISODateTimeString | null;
}
export interface Database {
  public: {
    Tables: {
      cierres_caja: {
        Row: CierreCaja;
        Insert: CierreCajaInsert;
        Update: CierreCajaUpdate;
        Relationships: [];
      };
      auditoria_eventos: {
        Row: AuditoriaEvento;
        Insert: AuditoriaEventoInsert;
        Update: AuditoriaEventoUpdate;
        Relationships: [];
      };
      egresos: {
        Row: Egreso;
        Insert: EgresoInsert;
        Update: EgresoUpdate;
        Relationships: [];
      };
      egreso_plantillas: {
        Row: EgresoPlantilla;
        Insert: EgresoPlantillaInsert;
        Update: EgresoPlantillaUpdate;
        Relationships: [];
      };
      productos: {
        Row: Producto;
        Insert: ProductoInsert;
        Update: ProductoUpdate;
        Relationships: [];
      };
      clientes: {
        Row: Cliente;
        Insert: ClienteInsert;
        Update: ClienteUpdate;
        Relationships: [];
      };
      inventario_diario: {
        Row: InventarioDiario;
        Insert: InventarioDiarioInsert;
        Update: InventarioDiarioUpdate;
        Relationships: [];
      };
      inventario_movimientos: {
        Row: InventarioMovimiento;
        Insert: InventarioMovimientoInsert;
        Update: InventarioMovimientoUpdate;
        Relationships: [];
      };
      pedido_detalles: {
        Row: PedidoDetalle;
        Insert: PedidoDetalleInsert;
        Update: PedidoDetalleUpdate;
        Relationships: [
          {
            foreignKeyName: "pedido_detalles_pedido_id_fkey";
            columns: ["pedido_id"];
            isOneToOne: false;
            referencedRelation: "pedidos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedido_detalles_producto_id_fkey";
            columns: ["producto_id"];
            isOneToOne: false;
            referencedRelation: "productos";
            referencedColumns: ["id"];
          },
        ];
      };
      pedidos: {
        Row: Pedido;
        Insert: PedidoInsert;
        Update: PedidoUpdate;
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ];
      };
      repartidor_push_tokens: {
        Row: RepartidorPushToken;
        Insert: RepartidorPushTokenInsert;
        Update: RepartidorPushTokenUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      actualizar_cliente_admin: {
        Args: {
          p_cliente_id: UUID;
          p_nombre: string;
          p_telefono: string;
          p_direccion_habitual?: string | null;
          p_referencias?: string | null;
        };
        Returns: Cliente;
      };
      es_usuario_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      eliminar_cliente_admin: {
        Args: {
          p_cliente_id: UUID;
        };
        Returns: UUID;
      };
      eliminar_pedido_admin: {
        Args: {
          p_pedido_id: UUID;
        };
        Returns: Json;
      };
      get_printable_order: {
        Args: {
          p_pedido_id: UUID;
        };
        Returns: Json;
      };
      get_clientes_frecuencia_mensual: {
        Args: {
          p_month?: ISODateString | null;
          p_limit?: number | null;
        };
        Returns: ClienteFrecuenciaMensualRpc[];
      };
      guardar_producto_admin: {
        Args: {
          p_producto_id?: UUID | null;
          p_nombre?: string | null;
          p_descripcion?: string | null;
          p_precio?: number | null;
          p_categoria?: string | null;
          p_subcategoria?: string | null;
          p_piezas_inventario?: number | null;
          p_requiere_variante_3_4?: boolean | null;
          p_modo_descuento_inventario?: string | null;
          p_piezas_a_seleccionar?: number | null;
          p_piezas_permitidas?: Json | null;
          p_permite_repetir_piezas?: boolean | null;
          p_desglose_fijo?: Json | null;
        };
        Returns: Producto;
      };
      registrar_venta: {
        Args: {
          p_total: number;
          p_tipo_pedido: string;
          p_metodo_pago: string;
          p_estado_pago: string;
          p_cliente_id?: UUID | null;
          p_estado?: string | null;
          p_fecha?: ISODateString;
          p_detalles?: Json;
        };
        Returns: InventarioDiario | null;
      };
      registrar_venta_pos: {
        Args: {
          p_total: number;
          p_tipo_pedido: string;
          p_metodo_pago: string;
          p_estado_pago: string;
          p_cliente_id?: UUID | null;
          p_estado?: string | null;
          p_fecha?: ISODateString;
          p_detalles?: Json;
        };
        Returns: Json;
      };
      reabrir_inventario_dia: {
        Args: {
          p_inventory_id: UUID;
        };
        Returns: InventarioDiario;
      };
      registrar_evento_auditoria: {
        Args: {
          p_modulo: AuditoriaModulo | string;
          p_accion: string;
          p_entidad: string;
          p_entidad_id?: string | null;
          p_detalle?: Json;
        };
        Returns: UUID;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
