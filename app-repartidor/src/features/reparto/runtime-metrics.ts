export type CriticalActionStatus = 'ok' | 'error';

export type RepartoTelemetryEntry = {
  id: number;
  at: string;
  action: string;
  status: CriticalActionStatus;
  detail?: string;
};

export type RepartoRuntimeSnapshot = {
  lastOrdersRefreshLatencyMs: number | null;
  lastSuccessfulSyncAt: string | null;
  lastRealtimeEventAt: string | null;
  telemetry: RepartoTelemetryEntry[];
};

type Listener = (snapshot: RepartoRuntimeSnapshot) => void;

const TELEMETRY_LIMIT = 30;

const runtimeState: RepartoRuntimeSnapshot = {
  lastOrdersRefreshLatencyMs: null,
  lastSuccessfulSyncAt: null,
  lastRealtimeEventAt: null,
  telemetry: [],
};

let telemetryId = 1;
const listeners = new Set<Listener>();

function emit() {
  const snapshot = getRepartoRuntimeSnapshot();
  listeners.forEach((listener) => {
    listener(snapshot);
  });
}

function pushTelemetry(action: string, status: CriticalActionStatus, detail?: string) {
  runtimeState.telemetry = [
    {
      id: telemetryId,
      at: new Date().toISOString(),
      action,
      status,
      detail,
    },
    ...runtimeState.telemetry,
  ].slice(0, TELEMETRY_LIMIT);
  telemetryId += 1;
}

export function getRepartoRuntimeSnapshot(): RepartoRuntimeSnapshot {
  return {
    lastOrdersRefreshLatencyMs: runtimeState.lastOrdersRefreshLatencyMs,
    lastSuccessfulSyncAt: runtimeState.lastSuccessfulSyncAt,
    lastRealtimeEventAt: runtimeState.lastRealtimeEventAt,
    telemetry: [...runtimeState.telemetry],
  };
}

export function subscribeRepartoRuntime(listener: Listener) {
  listeners.add(listener);
  listener(getRepartoRuntimeSnapshot());

  return () => {
    listeners.delete(listener);
  };
}

export function startOrdersRefreshTimer() {
  return Date.now();
}

export function recordOrdersRefreshSuccess(startedAt: number, source: string, orderCount: number) {
  runtimeState.lastOrdersRefreshLatencyMs = Math.max(0, Date.now() - startedAt);
  runtimeState.lastSuccessfulSyncAt = new Date().toISOString();
  pushTelemetry('pedidos_refresh', 'ok', `${source}: ${orderCount} pedidos`);
  emit();
}

export function recordOrdersRefreshError(startedAt: number, source: string, errorMessage: string) {
  runtimeState.lastOrdersRefreshLatencyMs = Math.max(0, Date.now() - startedAt);
  pushTelemetry('pedidos_refresh', 'error', `${source}: ${errorMessage}`);
  emit();
}

export function recordRealtimeEvent(eventName: string) {
  runtimeState.lastRealtimeEventAt = new Date().toISOString();
  pushTelemetry('realtime_event', 'ok', eventName);
  emit();
}

export function recordCriticalAction(action: string, status: CriticalActionStatus, detail?: string) {
  pushTelemetry(action, status, detail);
  emit();
}
