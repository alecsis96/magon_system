import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { captureClientData, getRepartoErrorMessage } from '@/src/features/reparto/capture-client-data';
import {
  recordCriticalAction,
  recordOrdersRefreshError,
  recordOrdersRefreshSuccess,
  recordRealtimeEvent,
  startOrdersRefreshTimer,
} from '@/src/features/reparto/runtime-metrics';
import { supabase } from '@/src/lib/supabase';

type PaymentStatus = 'pagado' | 'pendiente';

type DeliveryClient = {
  id: string;
  nombre: string;
  telefono: string | null;
  notas_entrega: string | null;
  latitud: number | null;
  longitud: number | null;
  url_foto_fachada: string | null;
};

type DeliveryOrder = {
  id: string;
  total: number | null;
  metodo_pago: string | null;
  estado_pago: PaymentStatus | null;
  clientes: DeliveryClient | null;
};

type DeliverPayload = {
  estado: 'entregado';
  estado_pago?: PaymentStatus;
  entrega_con_excepcion: boolean;
  motivo_entrega_excepcion: string | null;
  entregado_en: string;
};

type InlineFeedback = {
  type: 'success' | 'info';
  message: string;
};

type DetailFeedback = {
  type: 'error' | 'info';
  message: string;
};

type QuickFilter = 'all' | 'capture_pending' | 'payment_pending';

const CTA_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

const FILTER_OPTIONS: { key: QuickFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'capture_pending', label: 'Captura pendiente' },
  { key: 'payment_pending', label: 'Cobro pendiente' },
];

type HeaderProps = {
  totalOrders: number;
  filter: QuickFilter;
  onFilterChange: (filter: QuickFilter) => void;
  lastUpdatedAt: Date | null;
  isOffline: boolean;
  offlineMessage: string | null;
  onRetryNow: () => void;
  isRetrying: boolean;
  inlineFeedback: InlineFeedback | null;
};

type OrderCardProps = {
  item: DeliveryOrder;
  capturingClientId: string | null;
  deliveringOrderId: string | null;
  onCapture: (clienteId: string) => void;
  onDeliver: (pedidoId: string, metodoPago: string | null, estadoPago: PaymentStatus | null) => void;
  onRoute: (client: DeliveryClient | null) => void;
  onCall: (phone: string | null) => void;
  onOpenDetail: (order: DeliveryOrder) => void;
};

const GOOGLE_MAPS_BASE_URL = 'https://www.google.com/maps/search/?api=1&query=';

function formatCurrency(value: number | null) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(value ?? 0);
}

function getErrorMessage(error: unknown) {
  return getRepartoErrorMessage(error);
}

function normalizeOrders(rawOrders: unknown[]): DeliveryOrder[] {
  return rawOrders.map((rawOrder) => {
    const order = rawOrder as {
      id: string;
      total?: number | null;
      metodo_pago?: string | null;
      estado_pago?: PaymentStatus | null;
      clientes?: DeliveryClient | DeliveryClient[] | null;
    };

    const cliente = Array.isArray(order.clientes)
      ? (order.clientes[0] ?? null)
      : (order.clientes ?? null);

    return {
      id: order.id,
      total: order.total ?? 0,
      metodo_pago: order.metodo_pago ?? null,
      estado_pago: order.estado_pago ?? null,
      clientes: cliente,
    };
  });
}

function formatRelativeUpdate(timestamp: Date | null, now: number) {
  if (!timestamp) {
    return 'Sin actualizar';
  }

  const seconds = Math.max(0, Math.floor((now - timestamp.getTime()) / 1000));

  if (seconds < 60) {
    return `hace ${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `hace ${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  return `hace ${hours}h`;
}

function isCapturePending(order: DeliveryOrder) {
  const client = order.clientes;
  return !client?.latitud || !client?.url_foto_fachada;
}

function isPaymentPending(order: DeliveryOrder) {
  return order.estado_pago !== 'pagado';
}

function getOrderPriority(order: DeliveryOrder) {
  if (isCapturePending(order)) {
    return 0;
  }

  if (isPaymentPending(order)) {
    return 1;
  }

  return 2;
}

function playLightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

const DeliveryHeader = memo(function DeliveryHeader({
  totalOrders,
  filter,
  onFilterChange,
  lastUpdatedAt,
  isOffline,
  offlineMessage,
  onRetryNow,
  isRetrying,
  inlineFeedback,
}: HeaderProps) {
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setClock(Date.now());
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return (
    <View style={styles.headerCard}>
      <Text style={styles.headerTitle}>Reparto</Text>
      <View style={styles.headerMetaRow}>
        <Text style={styles.headerMetaItem}>Pedidos: {totalOrders}</Text>
        <Text style={styles.headerMetaItem}>Actualizado {formatRelativeUpdate(lastUpdatedAt, clock)}</Text>
      </View>

      {isOffline ? (
        <View style={styles.offlineCard}>
          <Text style={styles.offlineTitle}>Sin conexion operativa</Text>
          <Text style={styles.offlineText}>
            {offlineMessage ?? 'No se pudo contactar la API. Mostrando ultimo listado disponible.'}
          </Text>
          <TouchableOpacity
            style={[styles.offlineRetryButton, isRetrying && styles.buttonDisabled]}
            onPress={onRetryNow}
            disabled={isRetrying}
            hitSlop={CTA_HIT_SLOP}>
            <Text style={styles.offlineRetryButtonText}>{isRetrying ? 'Reintentando...' : 'Reintentar ahora'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((option) => {
          const isActive = option.key === filter;

          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => onFilterChange(option.key)}
              hitSlop={CTA_HIT_SLOP}>
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {inlineFeedback ? (
        <View
          style={[
            styles.inlineFeedbackCard,
            inlineFeedback.type === 'success'
              ? styles.inlineFeedbackCardSuccess
              : styles.inlineFeedbackCardInfo,
          ]}>
          <Text style={styles.inlineFeedbackText}>{inlineFeedback.message}</Text>
        </View>
      ) : null}
    </View>
  );
});

const OrderCard = memo(function OrderCard({
  item,
  capturingClientId,
  deliveringOrderId,
  onCapture,
  onDeliver,
  onRoute,
  onCall,
  onOpenDetail,
}: OrderCardProps) {
  const client = item.clientes;
  const requiresCapture = !client?.latitud || !client?.url_foto_fachada;
  const isCapturing = capturingClientId === client?.id;
  const isDelivering = deliveringOrderId === item.id;
  const canOpenRoute = Boolean(client?.latitud && client?.longitud);

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardIdentity}>
          <Text style={styles.cardEyebrow}>Pedido #{item.id.slice(0, 8)}</Text>
          <Text style={styles.cardTitle}>{client?.nombre ?? 'Cliente sin asignar'}</Text>
        </View>

        <View style={styles.cardAmountWrap}>
          <Text style={styles.cardAmount}>{formatCurrency(item.total)}</Text>
        </View>
      </View>

      <View style={styles.badgesRow}>
        <View
          style={[
            styles.badge,
            item.estado_pago === 'pagado' ? styles.badgePaid : styles.badgePending,
          ]}>
          <Text
            style={[
              styles.badgeText,
              item.estado_pago === 'pagado' ? styles.badgeTextPaid : styles.badgeTextPending,
            ]}>
            {item.estado_pago === 'pagado' ? 'Pago: pagado' : 'Pago: pendiente'}
          </Text>
        </View>

        <View
          style={[
            styles.badge,
            requiresCapture ? styles.badgeCapturePending : styles.badgeCaptureReady,
          ]}>
          <Text
            style={[
              styles.badgeText,
              requiresCapture ? styles.badgeTextCapturePending : styles.badgeTextCaptureReady,
            ]}>
            {requiresCapture ? 'Captura: pendiente' : 'Captura: completa'}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {requiresCapture ? (
          <TouchableOpacity
            style={[styles.primaryButton, styles.captureButton, isCapturing && styles.buttonDisabled]}
            onPress={() => client?.id && onCapture(client.id)}
            disabled={!client?.id || isCapturing}
            hitSlop={CTA_HIT_SLOP}>
            <Text style={styles.primaryButtonText}>{isCapturing ? 'Capturando...' : 'Capturar'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, isDelivering && styles.buttonDisabled]}
            onPress={() => onDeliver(item.id, item.metodo_pago, item.estado_pago)}
            disabled={isDelivering}
            hitSlop={CTA_HIT_SLOP}>
            <Text style={styles.primaryButtonText}>{isDelivering ? 'Entregando...' : 'Entregar'}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.secondaryRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, !canOpenRoute && styles.buttonDisabled]}
            onPress={() => onRoute(client)}
            disabled={!canOpenRoute}
            hitSlop={CTA_HIT_SLOP}>
            <Text style={styles.secondaryButtonText}>Ruta</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => onCall(client?.telefono ?? null)}
            hitSlop={CTA_HIT_SLOP}>
            <Text style={styles.secondaryButtonText}>Llamar</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.detailButton} onPress={() => onOpenDetail(item)} hitSlop={CTA_HIT_SLOP}>
          <Text style={styles.detailButtonText}>Ver detalle</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function DeliveryHomeScreen() {
  const insets = useSafeAreaInsets();
  const [activeOrders, setActiveOrders] = useState<DeliveryOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [capturingClientId, setCapturingClientId] = useState<string | null>(null);
  const [deliveringOrderId, setDeliveringOrderId] = useState<string | null>(null);
  const [fetchErrorMessage, setFetchErrorMessage] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [detailFeedback, setDetailFeedback] = useState<DetailFeedback | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [inlineFeedback, setInlineFeedback] = useState<InlineFeedback | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isActiveApp = appState === 'active';

  const fetchPedidos = useCallback(async (source: string = 'manual') => {
    const startedAt = startOrdersRefreshTimer();
    const { data, error } = await supabase
      .from('pedidos')
      .select(
        'id, total, metodo_pago, estado_pago, clientes(id, nombre, telefono, notas_entrega, latitud, longitud, url_foto_fachada)'
      )
      .eq('estado', 'en_camino')
      .order('fecha_creacion', { ascending: true });

    if (error) {
      recordOrdersRefreshError(startedAt, source, getErrorMessage(error));
      throw error;
    }

    const normalizedOrders = normalizeOrders((data ?? []) as unknown[]);
    setActiveOrders(normalizedOrders);
    setFetchErrorMessage(null);
    setIsOffline(false);
    setLastUpdatedAt(new Date());
    recordOrdersRefreshSuccess(startedAt, source, normalizedOrders.length);
  }, []);

  const showInlineFeedback = useCallback((feedback: InlineFeedback) => {
    setInlineFeedback(feedback);
  }, []);

  useEffect(() => {
    if (!inlineFeedback) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setInlineFeedback(null);
    }, 2500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [inlineFeedback]);

  useEffect(() => {
    const load = async () => {
      try {
        await fetchPedidos('initial_load');
      } catch (error) {
        console.error('Error loading active delivery orders:', error);
        const errorMessage = getErrorMessage(error);
        setFetchErrorMessage(errorMessage);
        setIsOffline(true);
        recordCriticalAction('pedidos_initial_load', 'error', errorMessage);
        Alert.alert('No se pudieron cargar los pedidos', errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [fetchPedidos]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const stopRealtime = useCallback(() => {
    if (!realtimeChannelRef.current) {
      return;
    }

    void supabase.removeChannel(realtimeChannelRef.current);
    realtimeChannelRef.current = null;
  }, []);

  const stopPolling = useCallback(() => {
    if (!pollingIntervalRef.current) {
      return;
    }

    clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = null;
  }, []);

  const startRealtime = useCallback(() => {
    if (realtimeChannelRef.current) {
      return;
    }

    const channel = supabase
      .channel('public:pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
        Vibration.vibrate(80);
        playLightHaptic();
        recordRealtimeEvent(payload.eventType ?? 'unknown');

        void fetchPedidos('realtime').catch((error) => {
          console.error('Error refreshing delivery orders from realtime:', error);
          const errorMessage = getErrorMessage(error);
          setFetchErrorMessage(errorMessage);
          setIsOffline(true);
          recordCriticalAction('pedidos_realtime_refresh', 'error', errorMessage);
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void fetchPedidos('realtime_subscribed').catch((error) => {
            console.error('Error refreshing delivery orders on subscribe:', error);
            const errorMessage = getErrorMessage(error);
            setFetchErrorMessage(errorMessage);
            setIsOffline(true);
            recordCriticalAction('pedidos_realtime_subscribed', 'error', errorMessage);
          });
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setIsOffline(true);
          setFetchErrorMessage('Conexion en tiempo real interrumpida.');
        }
      });

    realtimeChannelRef.current = channel;
  }, [fetchPedidos]);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      return;
    }

    pollingIntervalRef.current = setInterval(() => {
      void fetchPedidos('polling').catch((error) => {
        console.error('Error refreshing delivery orders from polling:', error);
        const errorMessage = getErrorMessage(error);
        setFetchErrorMessage(errorMessage);
        setIsOffline(true);
        recordCriticalAction('pedidos_polling_refresh', 'error', errorMessage);
      });
    }, 10000);
  }, [fetchPedidos]);

  useEffect(() => {
    if (isActiveApp) {
      startRealtime();
      startPolling();
      void fetchPedidos('appstate_active').catch((error) => {
        const errorMessage = getErrorMessage(error);
        setFetchErrorMessage(errorMessage);
        setIsOffline(true);
      });
      return;
    }

    stopRealtime();
    stopPolling();
  }, [fetchPedidos, isActiveApp, startPolling, startRealtime, stopPolling, stopRealtime]);

  useEffect(() => {
    return () => {
      stopRealtime();
      stopPolling();
    };
  }, [stopPolling, stopRealtime]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await fetchPedidos('manual_refresh');
      recordCriticalAction('manual_refresh', 'ok', 'Reintento manual exitoso');
    } catch (error) {
      console.error('Error refreshing active delivery orders:', error);
      const errorMessage = getErrorMessage(error);
      setFetchErrorMessage(errorMessage);
      setIsOffline(true);
      recordCriticalAction('manual_refresh', 'error', errorMessage);
      Alert.alert('No se pudieron actualizar los pedidos', 'Intenta nuevamente en unos segundos.');
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchPedidos]);

  const handleCaptureData = useCallback(
    async (clienteId: string) => {
      setCapturingClientId(clienteId);
      setDetailFeedback(null);
      playLightHaptic();

      try {
        const captureResult = await captureClientData(clienteId);

        if (captureResult.status === 'cancelled') {
          return;
        }

        showInlineFeedback({
          type: 'success',
          message: 'Captura guardada. Ya podes continuar con la entrega.',
        });
        recordCriticalAction('captura_cliente', 'ok', `cliente:${clienteId}`);
        await fetchPedidos('capture_success');
      } catch (error) {
        console.error('Error capturing delivery client data:', error);
        const errorMessage = getErrorMessage(error);
        setDetailFeedback({ type: 'error', message: `Captura fallida: ${errorMessage}` });
        recordCriticalAction('captura_cliente', 'error', errorMessage);
        Alert.alert('No se pudo guardar la captura', errorMessage);
      } finally {
        setCapturingClientId(null);
      }
    },
    [fetchPedidos, showInlineFeedback]
  );

  const handleOpenRoute = useCallback(async (client: DeliveryClient | null) => {
    playLightHaptic();

    if (!client?.latitud || !client.longitud) {
      setDetailFeedback({
        type: 'info',
        message: 'Ruta no disponible: faltan coordenadas en este cliente.',
      });
      recordCriticalAction('abrir_ruta', 'error', 'cliente_sin_coordenadas');
      Alert.alert('Ruta no disponible', 'Este cliente todavia no tiene coordenadas guardadas.');
      return;
    }

    try {
      const url = `${GOOGLE_MAPS_BASE_URL}${client.latitud},${client.longitud}`;
      await Linking.openURL(url);
      recordCriticalAction('abrir_ruta', 'ok', `cliente:${client.id}`);
    } catch (error) {
      console.error('Error opening route:', error);
      const errorMessage = getErrorMessage(error);
      setDetailFeedback({ type: 'error', message: `Ruta fallida: ${errorMessage}` });
      recordCriticalAction('abrir_ruta', 'error', errorMessage);
      Alert.alert('No se pudo abrir el mapa', errorMessage);
    }
  }, []);

  const handleCall = useCallback(async (phone: string | null) => {
    playLightHaptic();

    if (!phone) {
      setDetailFeedback({
        type: 'info',
        message: 'Llamada no disponible: el cliente no tiene telefono registrado.',
      });
      recordCriticalAction('llamar_cliente', 'error', 'cliente_sin_telefono');
      Alert.alert('Telefono no disponible', 'Este cliente no tiene telefono registrado.');
      return;
    }

    try {
      await Linking.openURL(`tel:${phone}`);
      recordCriticalAction('llamar_cliente', 'ok', `telefono:${phone}`);
    } catch (error) {
      console.error('Error starting call:', error);
      const errorMessage = getErrorMessage(error);
      setDetailFeedback({ type: 'error', message: `Llamada fallida: ${errorMessage}` });
      recordCriticalAction('llamar_cliente', 'error', errorMessage);
      Alert.alert('No se pudo iniciar la llamada', errorMessage);
    }
  }, []);

  const handleEntregar = useCallback(
    async (pedidoId: string, metodoPago: string | null, estadoPago: PaymentStatus | null) => {
      setDeliveringOrderId(pedidoId);
      setDetailFeedback(null);
      playLightHaptic();

      try {
        const payload: DeliverPayload = {
          estado: 'entregado',
          entrega_con_excepcion: false,
          motivo_entrega_excepcion: null,
          entregado_en: new Date().toISOString(),
        };

        if (metodoPago === 'efectivo' && estadoPago === 'pendiente') {
          payload.estado_pago = 'pagado';
        }

        const { error } = await supabase.from('pedidos').update(payload).eq('id', pedidoId);

        if (error) {
          throw error;
        }

        setActiveOrders((currentOrders) => currentOrders.filter((order) => order.id !== pedidoId));
        setSelectedOrder((currentSelected) => (currentSelected?.id === pedidoId ? null : currentSelected));
        showInlineFeedback({
          type: 'success',
          message: 'Entrega registrada correctamente.',
        });
        recordCriticalAction('entregar_pedido', 'ok', `pedido:${pedidoId}`);
      } catch (error) {
        console.error('Error updating delivered order:', error);
        const errorMessage = getErrorMessage(error);
        setDetailFeedback({ type: 'error', message: `Entrega fallida: ${errorMessage}` });
        recordCriticalAction('entregar_pedido', 'error', errorMessage);
        Alert.alert('No se pudo completar la entrega', 'Intenta nuevamente.');
      } finally {
        setDeliveringOrderId(null);
      }
    },
    [showInlineFeedback]
  );

  const handleEntregarConExcepcion = useCallback(
    (pedidoId: string, metodoPago: string | null, estadoPago: PaymentStatus | null) => {
      playLightHaptic();
      Alert.alert(
        'Confirmar entrega con excepcion',
        'No hay captura completa (GPS/foto). Esta accion queda registrada para auditoria. ¿Deseas continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Confirmar entrega',
            style: 'destructive',
            onPress: () => {
              setDeliveringOrderId(pedidoId);

              void (async () => {
                try {
                  const payload: DeliverPayload = {
                    estado: 'entregado',
                    entrega_con_excepcion: true,
                    motivo_entrega_excepcion: 'captura_omitida_repartidor',
                    entregado_en: new Date().toISOString(),
                  };

                  if (metodoPago === 'efectivo' && estadoPago === 'pendiente') {
                    payload.estado_pago = 'pagado';
                  }

                  const { error } = await supabase.from('pedidos').update(payload).eq('id', pedidoId);

                  if (error) {
                    throw error;
                  }

                  setActiveOrders((currentOrders) =>
                    currentOrders.filter((order) => order.id !== pedidoId)
                  );
                  setSelectedOrder((currentSelected) =>
                    currentSelected?.id === pedidoId ? null : currentSelected
                  );
                  showInlineFeedback({
                    type: 'info',
                    message: 'Entrega con excepcion registrada para auditoria.',
                  });
                  recordCriticalAction('entregar_con_excepcion', 'ok', `pedido:${pedidoId}`);
                } catch (error) {
                  console.error('Error updating delivered order with exception:', error);
                  const errorMessage = getErrorMessage(error);
                  setDetailFeedback({ type: 'error', message: `Entrega con excepcion fallida: ${errorMessage}` });
                  recordCriticalAction('entregar_con_excepcion', 'error', errorMessage);
                  Alert.alert('No se pudo completar la entrega', 'Intenta nuevamente.');
                } finally {
                  setDeliveringOrderId(null);
                }
              })();
            },
          },
        ]
      );
    },
    [showInlineFeedback]
  );

  const handleOpenDetail = useCallback((order: DeliveryOrder) => {
    playLightHaptic();
    setDetailFeedback(null);
    setSelectedOrder(order);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailFeedback(null);
    setSelectedOrder(null);
  }, []);

  const emptyMessage = useMemo(() => {
    if (isLoading) {
      return 'Cargando pedidos en camino...';
    }

    if (quickFilter === 'capture_pending') {
      return 'No hay pedidos con captura pendiente.';
    }

    if (quickFilter === 'payment_pending') {
      return 'No hay pedidos con cobro pendiente.';
    }

    return 'No hay pedidos activos para reparto.';
  }, [isLoading, quickFilter]);

  const displayedOrders = useMemo(() => {
    if (quickFilter === 'capture_pending') {
      return activeOrders.filter((order) => isCapturePending(order));
    }

    if (quickFilter === 'payment_pending') {
      return activeOrders.filter((order) => isPaymentPending(order));
    }

    return activeOrders
      .map((order, index) => ({ order, index }))
      .sort((left, right) => {
        const leftPriority = getOrderPriority(left.order);
        const rightPriority = getOrderPriority(right.order);

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return left.index - right.index;
      })
      .map((entry) => entry.order);
  }, [activeOrders, quickFilter]);

  const listBottomPadding = useMemo(() => 28 + insets.bottom + 72, [insets.bottom]);

  const listHeader = useMemo(
    () => (
      <DeliveryHeader
        totalOrders={displayedOrders.length}
        filter={quickFilter}
        onFilterChange={setQuickFilter}
        lastUpdatedAt={lastUpdatedAt}
        isOffline={isOffline}
        offlineMessage={fetchErrorMessage}
        onRetryNow={() => void handleRefresh()}
        isRetrying={isRefreshing}
        inlineFeedback={inlineFeedback}
      />
    ),
    [
      displayedOrders.length,
      fetchErrorMessage,
      handleRefresh,
      inlineFeedback,
      isOffline,
      isRefreshing,
      lastUpdatedAt,
      quickFilter,
    ]
  );

  const renderOrder = useCallback(
    ({ item }: { item: DeliveryOrder }) => (
      <OrderCard
        item={item}
        capturingClientId={capturingClientId}
        deliveringOrderId={deliveringOrderId}
        onCapture={(clienteId) => {
          void handleCaptureData(clienteId);
        }}
        onDeliver={(pedidoId, metodoPago, estadoPago) => {
          void handleEntregar(pedidoId, metodoPago, estadoPago);
        }}
        onRoute={(client) => {
          void handleOpenRoute(client);
        }}
        onCall={(phone) => {
          void handleCall(phone);
        }}
        onOpenDetail={handleOpenDetail}
      />
    ),
    [
      capturingClientId,
      deliveringOrderId,
      handleCall,
      handleCaptureData,
      handleEntregar,
      handleOpenDetail,
      handleOpenRoute,
    ]
  );

  const selectedClient = selectedOrder?.clientes ?? null;
  const selectedRequiresCapture = Boolean(
    selectedOrder && (!selectedClient?.latitud || !selectedClient?.url_foto_fachada)
  );
  const selectedIsDelivering = selectedOrder ? deliveringOrderId === selectedOrder.id : false;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <FlatList
          data={displayedOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          ListHeaderComponent={listHeader}
          contentContainerStyle={
            displayedOrders.length === 0
              ? [styles.emptyContainer, { paddingBottom: listBottomPadding }]
              : [styles.listContent, { paddingBottom: listBottomPadding }]
          }
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyMessage}</Text>}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={60}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
        />
      </View>

      <Modal
        visible={Boolean(selectedOrder)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeDetail}>
        <SafeAreaView style={styles.detailSafeArea} edges={['top', 'left', 'right', 'bottom']}>
          <View style={styles.detailContainer}>
            <View style={styles.detailHeader}>
              <View>
                <Text style={styles.detailEyebrow}>Pedido #{selectedOrder?.id.slice(0, 8)}</Text>
                <Text style={styles.detailTitle}>{selectedClient?.nombre ?? 'Cliente sin asignar'}</Text>
              </View>
              <TouchableOpacity style={styles.detailCloseButton} onPress={closeDetail} hitSlop={CTA_HIT_SLOP}>
                <Text style={styles.detailCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.detailTopActionsRow}>
              <TouchableOpacity
                style={[styles.detailTopActionButton, !selectedClient?.latitud && styles.buttonDisabled]}
                onPress={() => void handleOpenRoute(selectedClient)}
                hitSlop={CTA_HIT_SLOP}
                disabled={!selectedClient?.latitud || !selectedClient?.longitud}>
                <Text style={styles.detailTopActionText}>Ruta</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.detailTopActionButton, !selectedClient?.telefono && styles.buttonDisabled]}
                onPress={() => void handleCall(selectedClient?.telefono ?? null)}
                hitSlop={CTA_HIT_SLOP}
                disabled={!selectedClient?.telefono}>
                <Text style={styles.detailTopActionText}>Llamar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.riskSummaryCard}>
              <Text style={styles.detailLabel}>Riesgo operativo</Text>
              <View style={styles.riskSummaryRow}>
                <View
                  style={[
                    styles.riskBadge,
                    selectedRequiresCapture ? styles.riskBadgePending : styles.riskBadgeOk,
                  ]}>
                  <Text
                    style={[
                      styles.riskBadgeText,
                      selectedRequiresCapture ? styles.riskBadgeTextPending : styles.riskBadgeTextOk,
                    ]}>
                    {selectedRequiresCapture ? 'Captura pendiente' : 'Captura completa'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.riskBadge,
                    selectedOrder && isPaymentPending(selectedOrder)
                      ? styles.riskBadgePending
                      : styles.riskBadgeOk,
                  ]}>
                  <Text
                    style={[
                      styles.riskBadgeText,
                      selectedOrder && isPaymentPending(selectedOrder)
                        ? styles.riskBadgeTextPending
                        : styles.riskBadgeTextOk,
                    ]}>
                    {selectedOrder && isPaymentPending(selectedOrder)
                      ? 'Cobro pendiente'
                      : 'Cobro al dia'}
                  </Text>
                </View>
              </View>
            </View>

            {detailFeedback ? (
              <View
                style={[
                  styles.detailFeedbackCard,
                  detailFeedback.type === 'error' ? styles.detailFeedbackError : styles.detailFeedbackInfo,
                ]}>
                <Text style={styles.detailFeedbackText}>{detailFeedback.message}</Text>
              </View>
            ) : null}

            <View style={styles.detailInfoCard}>
              <Text style={styles.detailLabel}>Telefono</Text>
              <Text style={styles.detailValue}>{selectedClient?.telefono ?? 'No disponible'}</Text>
            </View>

            <View style={styles.detailInfoCard}>
              <Text style={styles.detailLabel}>Direccion / referencias</Text>
              <Text style={styles.detailNotesText}>
                {selectedClient?.notas_entrega?.trim() || 'Sin direccion o referencias registradas'}
              </Text>
            </View>

            {selectedClient?.url_foto_fachada ? (
              <View style={styles.detailInfoCard}>
                <Text style={styles.detailLabel}>Foto de fachada</Text>
                <TouchableOpacity
                  style={styles.detailPhotoButton}
                  onPress={() => setPreviewImageUrl(selectedClient.url_foto_fachada)}
                  activeOpacity={0.9}>
                  <Image
                    source={{ uri: selectedClient.url_foto_fachada }}
                    style={styles.detailPhoto}
                    resizeMode="cover"
                  />
                  <View style={styles.detailPhotoBadge}>
                    <Text style={styles.detailPhotoBadgeText}>Ampliar</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.detailInfoCard}>
                <Text style={styles.detailLabel}>Foto de fachada</Text>
                <Text style={styles.detailMissingPhoto}>Sin foto registrada para este cliente.</Text>
              </View>
            )}

            {selectedRequiresCapture && selectedOrder ? (
              <TouchableOpacity
                style={[styles.exceptionButton, selectedIsDelivering && styles.buttonDisabled]}
                onPress={() =>
                  handleEntregarConExcepcion(
                    selectedOrder.id,
                    selectedOrder.metodo_pago,
                    selectedOrder.estado_pago
                  )
                }
                disabled={selectedIsDelivering}
                hitSlop={CTA_HIT_SLOP}>
                <Text style={styles.exceptionButtonText}>
                  {selectedIsDelivering ? 'Entregando...' : 'Entregar con excepcion'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.detailBottomActions}>
              <TouchableOpacity style={styles.detailSecondaryButton} onPress={closeDetail} hitSlop={CTA_HIT_SLOP}>
                <Text style={styles.detailSecondaryButtonText}>Volver al listado</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={Boolean(previewImageUrl)}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewImageUrl(null)}>
        <View style={styles.previewOverlay}>
          <Pressable style={styles.previewBackdrop} onPress={() => setPreviewImageUrl(null)} />

          <View style={[styles.previewCard, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Fachada del cliente</Text>
              <TouchableOpacity style={styles.previewCloseButton} onPress={() => setPreviewImageUrl(null)}>
                <Text style={styles.previewCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            {previewImageUrl ? (
              <Image source={{ uri: previewImageUrl }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
          </View>
        </View>
      </Modal>

      {fetchErrorMessage && !isOffline ? (
        <View style={[styles.fetchErrorCard, { bottom: Math.max(insets.bottom, 12) }]}> 
          <Text style={styles.fetchErrorLabel}>Error de actualizacion</Text>
          <Text style={styles.fetchErrorValue}>{fetchErrorMessage}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef2f7',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerCard: {
    marginBottom: 14,
    marginTop: 8,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerMetaRow: {
    gap: 4,
  },
  headerMetaItem: {
    fontSize: 13,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  offlineCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,146,60,0.55)',
    backgroundColor: 'rgba(255,237,213,0.22)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  offlineTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fdba74',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  offlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffedd5',
  },
  offlineRetryButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#fb923c',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  offlineRetryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#431407',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(15,23,42,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.22)',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  filterChipTextActive: {
    color: '#fef3c7',
  },
  inlineFeedbackCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inlineFeedbackCardSuccess: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderColor: 'rgba(16,185,129,0.28)',
  },
  inlineFeedbackCardInfo: {
    backgroundColor: 'rgba(56,189,248,0.18)',
    borderColor: 'rgba(56,189,248,0.28)',
  },
  inlineFeedbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  listContent: {
    gap: 12,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    gap: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardIdentity: {
    flex: 1,
    gap: 4,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    color: '#ea580c',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardAmountWrap: {
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cardAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgePaid: {
    backgroundColor: '#dcfce7',
  },
  badgePending: {
    backgroundColor: '#fee2e2',
  },
  badgeCaptureReady: {
    backgroundColor: '#dbeafe',
  },
  badgeCapturePending: {
    backgroundColor: '#fff7ed',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextPaid: {
    color: '#166534',
  },
  badgeTextPending: {
    color: '#b91c1c',
  },
  badgeTextCaptureReady: {
    color: '#1d4ed8',
  },
  badgeTextCapturePending: {
    color: '#c2410c',
  },
  actions: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  captureButton: {
    backgroundColor: '#ea580c',
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3730a3',
  },
  detailButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  detailButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  detailSafeArea: {
    flex: 1,
    backgroundColor: '#eef2f7',
  },
  detailContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
  },
  detailHeader: {
    borderRadius: 20,
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  detailEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    color: '#f59e0b',
  },
  detailTitle: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
  },
  detailCloseButton: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  detailTopActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  detailTopActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  detailTopActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  riskSummaryCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  riskSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  riskBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  riskBadgePending: {
    backgroundColor: '#ffedd5',
  },
  riskBadgeOk: {
    backgroundColor: '#dcfce7',
  },
  riskBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  riskBadgeTextPending: {
    color: '#c2410c',
  },
  riskBadgeTextOk: {
    color: '#166534',
  },
  detailFeedbackCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailFeedbackError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  detailFeedbackInfo: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
  },
  detailFeedbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  detailInfoCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  detailNotesText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 21,
  },
  detailPhotoButton: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  detailPhoto: {
    width: '100%',
    height: 220,
    backgroundColor: '#e2e8f0',
  },
  detailPhotoBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.76)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detailPhotoBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  detailMissingPhoto: {
    fontSize: 15,
    color: '#64748b',
  },
  exceptionButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fb923c',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  exceptionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#c2410c',
  },
  detailBottomActions: {
    marginTop: 'auto',
    gap: 10,
    paddingBottom: 8,
  },
  detailSecondaryButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 12,
  },
  detailSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  previewCard: {
    borderRadius: 28,
    backgroundColor: '#0f172a',
    padding: 18,
    gap: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  previewCloseButton: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  previewCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  previewImage: {
    width: '100%',
    height: 420,
    borderRadius: 20,
    backgroundColor: '#020617',
  },
  fetchErrorCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fdba74',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  fetchErrorLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: '#c2410c',
  },
  fetchErrorValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9a3412',
  },
});
