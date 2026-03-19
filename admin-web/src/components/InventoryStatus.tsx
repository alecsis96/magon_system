interface InventoryStatusProps {
  stockDisponible: number
  stockInicioDia: number
  pollosVendidos: number
  mermasRegistradas: number
  warningMessage?: string | null
}

function formatMetric(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

export function InventoryStatus({
  stockDisponible,
  stockInicioDia,
  pollosVendidos,
  mermasRegistradas,
  warningMessage = null,
}: InventoryStatusProps) {
  return (
    <section className="mb-5 rounded-[1.75rem] bg-slate-900 p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
        Estado de inventario
      </p>

      {warningMessage ? (
        <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/12 px-4 py-3 text-sm font-semibold text-amber-300">
          {warningMessage}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Stock Disponible
          </p>
          <p className="mt-2 text-2xl font-black text-white">
            {formatMetric(stockDisponible)}
          </p>
          <p className="text-xs text-slate-400">
            Inicio del dia: {formatMetric(stockInicioDia)} pollos
          </p>
        </div>

        <div className="rounded-2xl bg-emerald-500/12 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Pollos Vendidos
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-400">
            {formatMetric(pollosVendidos)}
          </p>
          <p className="text-xs text-emerald-200/80">
            Basado en el estado actual
          </p>
        </div>

        <div className="rounded-2xl bg-rose-500/12 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
            Mermas Registradas Hoy
          </p>
          <p className="mt-2 text-2xl font-black text-rose-400">
            {formatMetric(mermasRegistradas)}
          </p>
          <p className="text-xs text-rose-200/80">Piezas defectuosas marcadas</p>
        </div>
      </div>
    </section>
  )
}

export default InventoryStatus
