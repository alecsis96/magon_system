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
export type EstadoPago = "pendiente" | "pagado";
export interface Producto extends Record<string, unknown> {
  id: UUID;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: ProductoCategoria | null;
  subcategoria: ProductoSubcategoria | null;
  clave_inventario: string | null;
  requiere_variante_3_4: boolean;
}
export interface ProductoInsert extends Record<string, unknown> {
  id?: UUID;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  categoria?: ProductoCategoria | null;
  subcategoria?: ProductoSubcategoria | null;
  clave_inventario?: string | null;
  requiere_variante_3_4?: boolean;
}
export interface ProductoUpdate extends Record<string, unknown> {
  id?: UUID;
  nombre?: string;
  descripcion?: string | null;
  precio?: number;
  categoria?: ProductoCategoria | null;
  subcategoria?: ProductoSubcategoria | null;
  clave_inventario?: string | null;
  requiere_variante_3_4?: boolean;
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
  creado_por: UUID | null;
  creado_en: ISODateTimeString;
}
export interface EgresoInsert extends Record<string, unknown> {
  id?: UUID;
  fecha?: ISODateString;
  categoria: string;
  concepto: string;
  monto: number;
  creado_por?: UUID | null;
  creado_en?: ISODateTimeString;
}
export interface EgresoUpdate extends Record<string, unknown> {
  id?: UUID;
  fecha?: ISODateString;
  categoria?: string;
  concepto?: string;
  monto?: number;
  creado_por?: UUID | null;
  creado_en?: ISODateTimeString;
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
export interface Database {
  public: {
    Tables: {
      egresos: {
        Row: Egreso;
        Insert: EgresoInsert;
        Update: EgresoUpdate;
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
        Returns: InventarioDiario;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
