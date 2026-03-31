import { useEffect, useState } from "react"
import { Toaster, toast } from "react-hot-toast"
import { AdminAccessButton } from "./components/AdminAccessButton"
import { AccountingDashboard } from "./components/AccountingDashboard"
import { AdminClientes } from "./components/AdminClientes"
import { OptionalCheckoutCustomerPicker } from "./components/OptionalCheckoutCustomerPicker"
import { CustomerSelector } from "./components/CustomerSelector"
import { InventoryManager } from "./components/InventoryManager"
import { OrdersMonitor } from "./components/OrdersMonitor"
import { POSMenu } from "./components/POSMenu"
import { ProductCatalogManager } from "./components/ProductCatalogManager"
import {
  PIECE_LABELS,
  THREE_QUARTER_VARIANTS,
  THREE_QUARTER_VARIANT_LABELS,
  getInventoryPieceCount,
  getProductBreakdown,
  resolveInventoryProductKey,
  type InventoryPieceKey,
  type PieceBreakdown,
  type ThreeQuarterVariant,
} from "./constants/inventory"
import {
  ejecutarImpresionBluetooth,
  generarTextoTicket,
  type PrintableOrder,
} from "./lib/printing"
import { supabase } from "./lib/supabase"
import type { Cliente, PedidoInsert, Producto } from "./types/database"

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

type ProductoDetalle = {
  piezasInventario: number
  desglose: string | null
  mermaOptions: string[]
}

type CartItem = {
  lineId: string
  producto: Producto
  merma: string | null
  threeQuarterVariant: ThreeQuarterVariant | null
  singlePieceType: InventoryPieceKey | null
}

type RegistrarVentaPosResult = {
  pedido_id: string
  folio: string | null
  fecha_creacion: string | null
  total: number
  tipo_pedido: string
  metodo_pago: string | null
  estado_pago: string
  cliente_id: string | null
  estado: string | null
}

const MERMA_OPTIONS = [
  "Ala quemada",
  "Pierna quemada",
  "Muslo quemado",
  "Pechuga grande quemada",
  "Pechuga chica quemada",
]

const MERMA_TO_PIECE_MAP: Record<string, InventoryPieceKey> = {
  "Ala quemada": "alas",
  "Pierna quemada": "piernas",
  "Muslo quemado": "muslos",
  "Pechuga grande quemada": "pechugas_grandes",
  "Pechuga chica quemada": "pechugas_chicas",
}

const PRODUCTO_DETALLES: Record<string, ProductoDetalle> = {
  "1_pollo": {
    piezasInventario: 10,
    desglose: "2 alas, 2 piernas, 2 muslos, 2 pechugas grandes y 2 pechugas chicas",
    mermaOptions: MERMA_OPTIONS,
  },
  "3/4_pollo": {
    piezasInventario: 7,
    desglose: "1/2 pollo + ala + pechuga grande o 1/2 pollo + pierna + muslo",
    mermaOptions: MERMA_OPTIONS,
  },
  "1/2_pollo": {
    piezasInventario: 5,
    desglose: null,
    mermaOptions: MERMA_OPTIONS,
  },
  "1_PIEZA": {
    piezasInventario: 1,
    desglose: "Descuenta 1 pieza del inventario principal",
    mermaOptions: MERMA_OPTIONS,
  },
  combo_papas: {
    piezasInventario: 10,
    desglose: null,
    mermaOptions: MERMA_OPTIONS,
  },
}

function getProductoDetalle(producto: Producto): ProductoDetalle {
  const productKey = resolveInventoryProductKey(producto)
  const inventoryPieces = getInventoryPieceCount(producto) ?? 0

  return (
    (productKey ? PRODUCTO_DETALLES[productKey] : null) ?? {
      piezasInventario: inventoryPieces,
      desglose:
        inventoryPieces > 0
          ? `${inventoryPieces} pieza${inventoryPieces === 1 ? "" : "s"} descontadas del inventario principal`
          : null,
      mermaOptions: MERMA_OPTIONS,
    }
  )
}

function isThreeQuarterProduct(producto: Producto) {
  return (
    producto.requiere_variante_3_4 ||
    resolveInventoryProductKey(producto) === "3/4_pollo"
  )
}

function isSinglePieceProduct(producto: Producto) {
  return (getInventoryPieceCount(producto) ?? 0) === 1
}

function createEmptyPieceBreakdown(): PieceBreakdown {
  return {
    alas: 0,
    piernas: 0,
    muslos: 0,
    pechugas_grandes: 0,
    pechugas_chicas: 0,
  }
}

function getCartItemBreakdown(item: CartItem) {
  if (isThreeQuarterProduct(item.producto)) {
    if (!item.threeQuarterVariant) {
      return createEmptyPieceBreakdown()
    }

    return THREE_QUARTER_VARIANTS[item.threeQuarterVariant]
  }

  if (isSinglePieceProduct(item.producto)) {
    if (!item.singlePieceType) {
      return createEmptyPieceBreakdown()
    }

    return {
      ...createEmptyPieceBreakdown(),
      [item.singlePieceType]: 1,
    }
  }

  return getProductBreakdown(item.producto)
}

function getCartItemMermaBreakdown(item: CartItem) {
  const mermaBreakdown = createEmptyPieceBreakdown()

  if (!item.merma) {
    return mermaBreakdown
  }

  const mermaPiece = MERMA_TO_PIECE_MAP[item.merma]

  if (mermaPiece) {
    mermaBreakdown[mermaPiece] = 1
  }

  return mermaBreakdown
}

function getTodayLocalISODate() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)

  return localDate.toISOString().slice(0, 10)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function showSaleSuccessToast(totalVenta: number, piezas: number) {
  toast.custom(
    () => (
      <div className="w-[min(90vw,18rem)] rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur">
        <p className="text-sm font-semibold text-slate-900">
          Venta registrada
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {currencyFormatter.format(totalVenta)} - {piezas} pzs
        </p>
      </div>
    ),
    { duration: 1800, position: "top-right" },
  )
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message

    if (typeof message === "string" && message.trim()) {
      return message
    }
  }

  return "No se pudo completar la operacion"
}

function App() {
  const [activeTab, setActiveTab] = useState<
    "POS" | "MONITOR" | "INVENTARIO" | "PRODUCTOS" | "CONTABILIDAD" | "CLIENTES"
  >("POS")
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)
  const [openMermaItemId, setOpenMermaItemId] = useState<string | null>(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [tipoPedido, setTipoPedido] = useState<"mostrador" | "domicilio">(
    "mostrador",
  )
  const [selectedCustomer, setSelectedCustomer] = useState<Cliente | null>(null)
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "transferencia">(
    "efectivo",
  )
  const [estadoPago, setEstadoPago] = useState<"pagado" | "pendiente">(
    "pagado",
  )

  useEffect(() => {
    if (tipoPedido === "mostrador") {
      setEstadoPago("pagado")
      return
    }

    setEstadoPago("pendiente")
  }, [tipoPedido])

  function handleAddToCart(producto: Producto) {
    setCart((currentCart) => [
      ...currentCart,
      {
        lineId: `${producto.id}-${currentCart.length + 1}-${Date.now()}`,
        producto,
        merma: null,
        threeQuarterVariant: isThreeQuarterProduct(producto)
          ? "ala_pechuga"
          : null,
        singlePieceType: null,
      },
    ])
  }

  function handleMermaChange(lineId: string, merma: string) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.lineId === lineId
          ? { ...item, merma: merma === "" ? null : merma }
          : item,
      ),
    )
  }

  function handleThreeQuarterVariantChange(
    lineId: string,
    variant: ThreeQuarterVariant,
  ) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.lineId === lineId
          ? { ...item, threeQuarterVariant: variant }
          : item,
      ),
    )
  }

  function handleSinglePieceTypeChange(
    lineId: string,
    pieceType: InventoryPieceKey,
  ) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.lineId === lineId
          ? { ...item, singlePieceType: pieceType }
          : item,
      ),
    )
  }

  function handleRemoveFromCart(indexToRemove: number) {
    setCart((currentCart) =>
      currentCart.filter((_, index) => index !== indexToRemove),
    )
  }

  function handleRemoveLastFromCart() {
    setCart((currentCart) => {
      if (currentCart.length === 0) {
        return currentCart
      }

      const nextCart = currentCart.slice(0, -1)
      const removedItem = currentCart[currentCart.length - 1]

      if (openMermaItemId === removedItem?.lineId) {
        setOpenMermaItemId(null)
      }

      if (nextCart.length === 0) {
        setIsCheckoutModalOpen(false)
      }

      return nextCart
    })
  }

  function toggleMerma(lineId: string) {
    setOpenMermaItemId((currentId) => (currentId === lineId ? null : lineId))
  }

  function buildCheckoutDetails(cartItems: CartItem[]) {
    return cartItems.map((item) => {
      const detalle = getProductoDetalle(item.producto)
      const breakdown = getCartItemBreakdown(item)
      const mermaBreakdown = getCartItemMermaBreakdown(item)

      return {
        producto_uuid: isUuid(item.producto.id) ? item.producto.id : null,
        producto_codigo:
          resolveInventoryProductKey(item.producto) ?? item.producto.id,
        producto_nombre: item.producto.nombre,
        descripcion: item.producto.descripcion,
        cantidad: 1,
        precio_unitario: item.producto.precio,
        subtotal: item.producto.precio,
        piezas_inventario: detalle.piezasInventario,
        variante_3_4: item.threeQuarterVariant,
        merma_descripcion: item.merma,
        alas: breakdown.alas,
        piernas: breakdown.piernas,
        muslos: breakdown.muslos,
        pechugas_grandes: breakdown.pechugas_grandes,
        pechugas_chicas: breakdown.pechugas_chicas,
        merma_alas: mermaBreakdown.alas,
        merma_piernas: mermaBreakdown.piernas,
        merma_muslos: mermaBreakdown.muslos,
        merma_pechugas_grandes: mermaBreakdown.pechugas_grandes,
        merma_pechugas_chicas: mermaBreakdown.pechugas_chicas,
      }
    })
  }

  async function handleCheckout() {
    if (cart.length === 0 || isCheckingOut) {
      return
    }

    if (
      cart.some(
        (item) => isSinglePieceProduct(item.producto) && !item.singlePieceType,
      )
    ) {
      toast.error("Selecciona la pieza de cada producto marcado como 1 Pieza")
      return
    }

    if (tipoPedido === "domicilio" && !selectedCustomer) {
      toast.error("Selecciona un cliente para pedidos a domicilio")
      return
    }

    try {
      setIsCheckingOut(true)
      const checkoutDetails = buildCheckoutDetails(cart)
      const posSupabase = supabase as typeof supabase & {
        rpc: {
          (
            fn: "registrar_venta_pos",
            args: {
              p_total: number
              p_tipo_pedido: string
              p_metodo_pago: string
              p_estado_pago: string
              p_cliente_id: string | null
              p_estado: string | null
              p_fecha: string
              p_detalles: ReturnType<typeof buildCheckoutDetails>
            },
          ): Promise<{
            data: RegistrarVentaPosResult | null
            error: Error | null
          }>
          (
            fn: "get_printable_order",
            args: { p_pedido_id: string },
          ): Promise<{
            data: PrintableOrder | null
            error: Error | null
          }>
        }
      }

      const pedidoPayload: PedidoInsert = {
        total,
        cliente_id: selectedCustomer?.id ?? null,
        tipo_pedido: tipoPedido,
        metodo_pago: metodoPago,
        estado_pago: estadoPago,
        ...(tipoPedido === "domicilio"
          ? {
              estado: "en_preparacion",
            }
          : {}),
      }

      const { data: ventaGuardada, error } = await posSupabase.rpc(
        "registrar_venta_pos",
        {
        p_total: pedidoPayload.total,
        p_tipo_pedido: pedidoPayload.tipo_pedido,
        p_metodo_pago: pedidoPayload.metodo_pago ?? "efectivo",
        p_estado_pago: pedidoPayload.estado_pago,
        p_cliente_id: pedidoPayload.cliente_id ?? null,
        p_estado: pedidoPayload.estado ?? null,
        p_fecha: getTodayLocalISODate(),
        p_detalles: checkoutDetails,
      },
      )

      if (error) {
        throw error
      }

      if (!ventaGuardada?.pedido_id) {
        throw new Error("La venta se guardo sin devolver el pedido para impresion")
      }

      try {
        const { data: printableOrder, error: printableOrderError } =
          await posSupabase.rpc("get_printable_order", {
            p_pedido_id: ventaGuardada.pedido_id,
          })

        if (printableOrderError) {
          throw printableOrderError
        }

        if (!printableOrder) {
          throw new Error("No se pudo recuperar el pedido para impresion")
        }

        const ticketCocina = generarTextoTicket(printableOrder, true)
        const ticketCliente = generarTextoTicket(printableOrder, false)

        ejecutarImpresionBluetooth(ticketCocina)
        window.setTimeout(() => {
          ejecutarImpresionBluetooth(ticketCliente)
        }, 3500)
      } catch (printError) {
        console.error("Error al imprimir la venta:", printError)
        toast.error("Venta guardada, pero no se pudo imprimir el ticket")
      }

      setCart([])
      setIsCheckoutModalOpen(false)
      setOpenMermaItemId(null)
      setSelectedCustomer(null)
      setTipoPedido("mostrador")
      setMetodoPago("efectivo")
      showSaleSuccessToast(total, piezasInventario)
    } catch (error) {
      console.error("Error al registrar la venta:", error)
      toast.error(getErrorMessage(error))
    } finally {
      setIsCheckingOut(false)
    }
  }

  const subtotal = cart.reduce(
    (currentTotal, item) => currentTotal + item.producto.precio,
    0,
  )
  const total = subtotal
  const piezasInventario = cart.reduce((currentTotal, item) => {
    const detalle = getProductoDetalle(item.producto)

    return currentTotal + detalle.piezasInventario + (item.merma ? 1 : 0)
  }, 0)
  const hasPendingSinglePieceSelection = cart.some(
    (item) => isSinglePieceProduct(item.producto) && !item.singlePieceType,
  )
  const isCheckoutDisabled =
    cart.length === 0 ||
    (tipoPedido === "domicilio" && !selectedCustomer) ||
    hasPendingSinglePieceSelection ||
    isCheckingOut

  return (
    <main className="min-h-screen overflow-x-clip bg-gray-100 p-4 text-slate-900 sm:p-6">
      <Toaster position="top-right" />

      <div className="mx-auto max-w-7xl">
        <nav className="relative mb-6 flex flex-wrap items-center gap-2 rounded-[1.75rem] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 sm:flex-nowrap">
          {([
            { id: "POS", label: "Venta" },
            { id: "MONITOR", label: "Pedidos" },
          ] as const).map((tab) => {
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id)
                  setIsMoreMenuOpen(false)
                }}
                className={`min-w-0 flex-1 rounded-2xl px-3 py-3 text-sm font-bold transition sm:px-4 sm:text-base lg:px-5 lg:py-4 ${
                  isActive
                    ? "bg-slate-900 text-white shadow-[0_10px_25px_rgba(15,23,42,0.16)]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="block truncate">{tab.label}</span>
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => setIsMoreMenuOpen((current) => !current)}
            className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-black transition focus:outline-none focus:ring-4 ${
              activeTab === "INVENTARIO" ||
              activeTab === "PRODUCTOS" ||
              activeTab === "CONTABILIDAD" ||
              activeTab === "CLIENTES"
                ? "bg-slate-900 text-white shadow-[0_10px_25px_rgba(15,23,42,0.16)] focus:ring-slate-200"
                : "bg-slate-50 text-slate-700 hover:bg-slate-100 focus:ring-slate-100"
            }`}
            aria-expanded={isMoreMenuOpen}
            aria-label="Abrir mas opciones"
          >
            Menu
          </button>

          {isMoreMenuOpen ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 rounded-[1.5rem] border border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.16)] sm:left-auto sm:right-2 sm:min-w-[14rem]">
              {([
                { id: "INVENTARIO", label: "Inventario" },
                { id: "PRODUCTOS", label: "Productos" },
                { id: "CONTABILIDAD", label: "Contabilidad" },
                { id: "CLIENTES", label: "Clientes" },
              ] as const).map((tab) => {
                const isActive = activeTab === tab.id

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id)
                      setIsMoreMenuOpen(false)
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                      isActive
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {isActive ? <span className="text-xs uppercase tracking-[0.18em]">Activo</span> : null}
                  </button>
                )
              })}

              <div className="my-2 border-t border-slate-200" />

              <div className="relative">
                <AdminAccessButton
                  className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-bold text-slate-700 shadow-none transition hover:bg-slate-50 focus:ring-slate-100"
                  panelClassName="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
                />
              </div>
            </div>
          ) : null}
        </nav>

        {activeTab === "POS" ? (
          <>
            <div className="flex h-[calc(100vh-80px)] flex-col overflow-hidden md:flex-row">
              <section className="flex-1 overflow-y-auto pb-24 md:w-[60%] md:pb-4">
                <POSMenu onSelectProduct={handleAddToCart} />
              </section>
            </div>

            {cart.length > 0 ? (
              <div className="fixed bottom-0 left-0 z-40 flex w-full items-center justify-between rounded-t-xl bg-gray-900 p-4 text-white shadow-[0_-18px_40px_rgba(15,23,42,0.22)]">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRemoveLastFromCart}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg font-black text-white transition hover:bg-white/20 focus:outline-none focus:ring-4 focus:ring-white/20"
                    aria-label="Quitar ultimo producto"
                  >
                    -
                  </button>
                  <p className="text-sm font-bold">
                    {cart.length} producto{cart.length === 1 ? "" : "s"} -{" "}
                    {currencyFormatter.format(total)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCheckoutModalOpen(true)}
                  className="rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-white/30"
                >
                  Ir a Cobrar
                </button>
              </div>
            ) : null}

            {isCheckoutModalOpen ? (
              <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-4">
                <div className="mx-auto flex min-h-full max-w-3xl flex-col">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Cobro
                      </p>
                      <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                        Ticket de venta
                      </h1>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCheckoutModalOpen(false)}
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
                    >
                      Volver
                    </button>
                  </div>

                  <div className="flex flex-1 flex-col">
                    {tipoPedido === "domicilio" ? (
                      <CustomerSelector
                        onCustomerSelect={setSelectedCustomer}
                        tipoPedido={tipoPedido}
                        onTipoPedidoChange={setTipoPedido}
                      />
                    ) : (
                      <section className="space-y-4">
                        <div className="rounded-[1.75rem] bg-slate-50 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 sm:p-5">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                              Tipo de pedido
                            </p>
                            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                              Cliente y entrega
                            </h2>
                          </div>
                          <div className="mt-4 rounded-[1.4rem] bg-white p-1.5 ring-1 ring-slate-200">
                            <div className="grid grid-cols-2 gap-1.5">
                              {(["mostrador", "domicilio"] as const).map((tipo) => {
                                const isActive = tipoPedido === tipo

                                return (
                                  <button
                                    key={tipo}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCustomer(null)
                                      setTipoPedido(tipo)
                                    }}
                                    className={`min-w-0 rounded-[1.2rem] px-3 py-3 text-center text-sm font-bold capitalize transition sm:px-5 ${
                                      isActive
                                        ? "bg-slate-900 text-white shadow-[0_10px_25px_rgba(15,23,42,0.18)]"
                                        : "text-slate-500 hover:bg-white hover:text-slate-900"
                                    }`}
                                  >
                                    <span className="block truncate">{tipo}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>

                        <OptionalCheckoutCustomerPicker
                          selectedCustomer={selectedCustomer}
                          onCustomerSelect={setSelectedCustomer}
                        />
                      </section>
                    )}

                    <div className="mt-4 border-b border-dashed border-slate-200 pb-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Factura
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {cart.length} producto{cart.length === 1 ? "" : "s"} agregado
                        {cart.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto py-4">
                      {cart.length === 0 ? (
                        <div className="flex h-full min-h-64 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm leading-relaxed text-slate-500">
                          El ticket esta vacio. Toca un producto del menu para agregarlo a la venta.
                        </div>
                      ) : (
                        cart.map((item, index) => {
                          const detalle = getProductoDetalle(item.producto)
                          const showMermaPanel = openMermaItemId === item.lineId
                          const showThreeQuarterSelector =
                            isThreeQuarterProduct(item.producto)
                          const showSinglePieceSelector =
                            isSinglePieceProduct(item.producto)

                          return (
                            <article
                              key={item.lineId}
                              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h2 className="text-base font-bold text-slate-900">
                                    {item.producto.nombre}
                                  </h2>
                                  <p className="mt-1 text-sm text-slate-500">
                                    {item.producto.descripcion}
                                  </p>
                                  {detalle.desglose ? (
                                    <p className="mt-1 text-xs text-slate-400">
                                      Desglose: {detalle.desglose}
                                    </p>
                                  ) : null}
                                  {showThreeQuarterSelector &&
                                  item.threeQuarterVariant ? (
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
                                      Variante:{" "}
                                      {
                                        THREE_QUARTER_VARIANT_LABELS[
                                          item.threeQuarterVariant
                                        ]
                                      }
                                    </p>
                                  ) : null}
                                  {showSinglePieceSelector ? (
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
                                      Pieza:{" "}
                                      {item.singlePieceType
                                        ? PIECE_LABELS[item.singlePieceType]
                                        : "Pendiente por seleccionar"}
                                    </p>
                                  ) : null}
                                  {item.merma ? (
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">
                                      Merma registrada: {item.merma}
                                    </p>
                                  ) : null}
                                </div>
                                <span className="shrink-0 text-base font-black text-slate-900">
                                  {currencyFormatter.format(item.producto.precio)}
                                </span>
                              </div>

                              <div className="mt-4 space-y-3">
                                {showThreeQuarterSelector ? (
                                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                                      Selecciona la combinacion del 3/4
                                    </p>
                                    <div className="mt-3 grid gap-2">
                                      {(
                                        Object.keys(
                                          THREE_QUARTER_VARIANT_LABELS,
                                        ) as ThreeQuarterVariant[]
                                      ).map((variant) => {
                                        const isActive =
                                          item.threeQuarterVariant === variant

                                        return (
                                          <button
                                            key={variant}
                                            type="button"
                                            onClick={() =>
                                              handleThreeQuarterVariantChange(
                                                item.lineId,
                                                variant,
                                              )
                                            }
                                            className={`rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${
                                              isActive
                                                ? "bg-slate-900 text-white"
                                                : "bg-white text-slate-700 ring-1 ring-amber-200 hover:bg-amber-100"
                                            }`}
                                          >
                                            {THREE_QUARTER_VARIANT_LABELS[variant]}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ) : null}

                                {showSinglePieceSelector ? (
                                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                                      Selecciona la pieza a descontar
                                    </p>
                                    <div className="mt-3 grid gap-2">
                                      {(Object.keys(
                                        PIECE_LABELS,
                                      ) as InventoryPieceKey[]).map((pieceKey) => {
                                        const isActive =
                                          item.singlePieceType === pieceKey

                                        return (
                                          <button
                                            key={pieceKey}
                                            type="button"
                                            onClick={() =>
                                              handleSinglePieceTypeChange(
                                                item.lineId,
                                                pieceKey,
                                              )
                                            }
                                            className={`rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${
                                              isActive
                                                ? "bg-slate-900 text-white"
                                                : "bg-white text-slate-700 ring-1 ring-sky-200 hover:bg-sky-100"
                                            }`}
                                          >
                                            {PIECE_LABELS[pieceKey]}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ) : null}

                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                    {detalle.piezasInventario} pzs salen de inventario
                                    {item.merma ? " + 1 reposicion" : ""}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveFromCart(index)}
                                      className="px-2 py-1 text-xs font-semibold text-rose-500 transition hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-100"
                                    >
                                      Eliminar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleMerma(item.lineId)}
                                      className="rounded-2xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 focus:outline-none focus:ring-4 focus:ring-rose-100"
                                    >
                                      Merma
                                    </button>
                                  </div>
                                </div>

                                {showMermaPanel ? (
                                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                    <label
                                      htmlFor={`merma-${item.lineId}`}
                                      className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
                                    >
                                      Pieza defectuosa
                                    </label>
                                    <select
                                      id={`merma-${item.lineId}`}
                                      value={item.merma ?? ""}
                                      onChange={(event) =>
                                        handleMermaChange(
                                          item.lineId,
                                          event.target.value,
                                        )
                                      }
                                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                    >
                                      <option value="">Sin merma</option>
                                      {detalle.mermaOptions.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : null}
                              </div>
                            </article>
                          )
                        })
                      )}
                    </div>

                    <div className="mt-auto border-t border-dashed border-slate-200 pt-4">
                      <div className="mb-4 space-y-4 rounded-3xl bg-slate-50 p-5">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Metodo de pago
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {([
                              { id: "efectivo", label: "Efectivo" },
                              { id: "transferencia", label: "Transferencia" },
                            ] as const).map((option) => {
                              const isActive = metodoPago === option.id

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => setMetodoPago(option.id)}
                                  className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                                    isActive
                                      ? "bg-slate-900 text-white shadow-[0_10px_25px_rgba(15,23,42,0.16)]"
                                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Estado de pago
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {([
                              { id: "pagado", label: "Pagado" },
                              { id: "pendiente", label: "Pendiente" },
                            ] as const).map((option) => {
                              const isActive = estadoPago === option.id

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => setEstadoPago(option.id)}
                                  className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                                    isActive
                                      ? option.id === "pagado"
                                        ? "bg-emerald-600 text-white shadow-[0_10px_25px_rgba(5,150,105,0.22)]"
                                        : "bg-rose-600 text-white shadow-[0_10px_25px_rgba(225,29,72,0.22)]"
                                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-3xl bg-slate-50 p-5">
                        <div className="flex items-center justify-between text-sm text-slate-500">
                          <span>Subtotal</span>
                          <span className="font-semibold text-slate-900">
                            {currencyFormatter.format(subtotal)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-500">
                          <span>Piezas fisicas</span>
                          <span className="font-semibold text-slate-900">
                            {piezasInventario} pzs
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-lg font-black text-slate-900">
                          <span>Total</span>
                          <span>{currencyFormatter.format(total)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCheckout}
                        disabled={isCheckoutDisabled}
                        className="mt-5 w-full rounded-3xl bg-slate-900 px-6 py-5 text-lg font-black text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                      >
                        {isCheckingOut
                          ? "Registrando venta..."
                          : `Confirmar Venta (${piezasInventario} pzs)`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : activeTab === "MONITOR" ? (
          <OrdersMonitor />
        ) : activeTab === "CLIENTES" ? (
          <div className="-mx-4 -mb-4 sm:-mx-6">
            <AdminClientes />
          </div>
        ) : activeTab === "INVENTARIO" ? (
          <InventoryManager />
        ) : activeTab === "CONTABILIDAD" ? (
          <AccountingDashboard />
        ) : (
          <ProductCatalogManager />
        )}
      </div>
    </main>
  )
}

export default App
