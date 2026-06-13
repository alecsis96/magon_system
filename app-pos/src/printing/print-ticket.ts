export async function printTicket(text: string) {
  const normalizedText = text.trim()

  if (!normalizedText) {
    throw new Error("Ticket vacio")
  }

  // Punto de integracion para el driver Bluetooth/ESC-POS del wrapper.
  // Dejamos el contrato listo para que el POS web ya pueda invocarlo
  // via window.AndroidPrinter.imprimirTicket(texto).
  console.log("PRINT_TICKET_PLACEHOLDER", normalizedText)
}
