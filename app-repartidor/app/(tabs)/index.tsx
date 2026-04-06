import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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

type HeaderProps = {
  totalOrders: number;
  lastUpdatedAt: Date | null;
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
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;

    if (typeof message === 'string' && message.trim()) {
      if (
        message.includes('ExponentImagePicker.launchCameraAsync') ||
        message.includes('NoSuchMethodError')
      ) {
        return 'La camara del APK quedo desalineada. Instala el build nuevo generado despues de actualizar dependencias.';
      }

      if (
        message.includes('Default FirebaseApp is not initialized') ||
        message.includes('google-services')
      ) {
        return 'Push Android sin configurar. Falta enlazar Firebase/FCM y reconstruir la app.';
      }

      return message;
    }
  }

  return 'Verifica permisos, conexion e intenta nuevamente.';
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

const DeliveryHeader = memo(function DeliveryHeader({
  totalOrders,
  lastUpdatedAt,
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
            disabled={!client?.id || isCapturing}>
            <Text style={styles.primaryButtonText}>{isCapturing ? 'Capturando...' : 'Capturar'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, isDelivering && styles.buttonDisabled]}
            onPress={() => onDeliver(item.id, item.metodo_pago, item.estado_pago)}
            disabled={isDelivering}>
            <Text style={styles.primaryButtonText}>{isDelivering ? 'Entregando...' : 'Entregar'}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.secondaryRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, !canOpenRoute && styles.buttonDisabled]}
            onPress={() => onRoute(client)}
            disabled={!canOpenRoute}>
            <Text style={styles.secondaryButtonText}>Ruta</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => onCall(client?.telefono ?? null)}>
            <Text style={styles.secondaryButtonText}>Llamar</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.detailButton} onPress={() => onOpenDetail(item)}>
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
  const [capturingClientId, setCapturingClientId] = useState<string | null>(null);
  const [deliveringOrderId, setDeliveringOrderId] = useState<string | null>(null);
  const [fetchErrorMessage, setFetchErrorMessage] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [inlineFeedback, setInlineFeedback] = useState<InlineFeedback | null>(null);

  const fetchPedidos = useCallback(async () => {
    const { data, error } = await supabase
      .from('pedidos')
      .select(
        'id, total, metodo_pago, estado_pago, clientes(id, nombre, telefono, notas_entrega, latitud, longitud, url_foto_fachada)'
      )
      .eq('estado', 'en_camino')
      .order('fecha_creacion', { ascending: true });

    if (error) {
      throw error;
    }

    setActiveOrders(normalizeOrders((data ?? []) as unknown[]));
    setFetchErrorMessage(null);
    setLastUpdatedAt(new Date());
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
        await fetchPedidos();
      } catch (error) {
        console.error('Error loading active delivery orders:', error);
        const errorMessage = getErrorMessage(error);
        setFetchErrorMessage(errorMessage);
        Alert.alert('No se pudieron cargar los pedidos', errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [fetchPedidos]);

  useEffect(() => {
    const subscription = supabase
      .channel('public:pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        Vibration.vibrate();
        void fetchPedidos().catch((error) => {
          console.error('Error refreshing delivery orders from realtime:', error);
          setFetchErrorMessage(getErrorMessage(error));
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void fetchPedidos().catch((error) => {
            console.error('Error refreshing delivery orders on subscribe:', error);
            setFetchErrorMessage(getErrorMessage(error));
          });
        }
      });

    return () => {
      void supabase.removeChannel(subscription);
    };
  }, [fetchPedidos]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void fetchPedidos().catch((error) => {
        console.error('Error refreshing delivery orders from polling:', error);
        setFetchErrorMessage(getErrorMessage(error));
      });
    }, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchPedidos]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await fetchPedidos();
    } catch (error) {
      console.error('Error refreshing active delivery orders:', error);
      Alert.alert('No se pudieron actualizar los pedidos', 'Intenta nuevamente en unos segundos.');
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchPedidos]);

  const handleCaptureData = useCallback(
    async (clienteId: string) => {
      setCapturingClientId(clienteId);

      try {
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();

        if (cameraPermission.status !== 'granted') {
          Alert.alert('Permiso requerido', 'Necesitamos acceso a la camara para capturar la fachada.');
          return;
        }

        const locationPermission = await Location.requestForegroundPermissionsAsync();

        if (locationPermission.status !== 'granted') {
          Alert.alert('Permiso requerido', 'Necesitamos tu ubicacion para guardar la entrega del cliente.');
          return;
        }

        const photoResult = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.5,
          base64: true,
          allowsEditing: false,
        });

        if (photoResult.canceled || !photoResult.assets[0]) {
          return;
        }

        const photoAsset = photoResult.assets[0];

        if (!photoAsset.base64) {
          throw new Error('No se pudo obtener la foto en base64');
        }

        Alert.alert('Guardando...', 'Subiendo foto y coordenadas del cliente.');

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const fileName = `${clienteId}-${Date.now()}.jpg`;
        const filePath = `clientes/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('fachadas')
          .upload(filePath, decode(photoAsset.base64), {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from('fachadas').getPublicUrl(filePath);

        const { error: updateError } = await supabase
          .from('clientes')
          .update({
            latitud: currentPosition.coords.latitude,
            longitud: currentPosition.coords.longitude,
            url_foto_fachada: publicUrl,
          })
          .eq('id', clienteId);

        if (updateError) {
          throw updateError;
        }

        showInlineFeedback({
          type: 'success',
          message: 'Captura guardada. Ya podes continuar con la entrega.',
        });
        await fetchPedidos();
      } catch (error) {
        console.error('Error capturing delivery client data:', error);
        Alert.alert('No se pudo guardar la captura', getErrorMessage(error));
      } finally {
        setCapturingClientId(null);
      }
    },
    [fetchPedidos, showInlineFeedback]
  );

  const handleOpenRoute = useCallback(async (client: DeliveryClient | null) => {
    if (!client?.latitud || !client.longitud) {
      Alert.alert('Ruta no disponible', 'Este cliente todavia no tiene coordenadas guardadas.');
      return;
    }

    try {
      const url = `${GOOGLE_MAPS_BASE_URL}${client.latitud},${client.longitud}`;
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error opening route:', error);
      Alert.alert('No se pudo abrir el mapa', getErrorMessage(error));
    }
  }, []);

  const handleCall = useCallback(async (phone: string | null) => {
    if (!phone) {
      Alert.alert('Telefono no disponible', 'Este cliente no tiene telefono registrado.');
      return;
    }

    try {
      await Linking.openURL(`tel:${phone}`);
    } catch (error) {
      console.error('Error starting call:', error);
      Alert.alert('No se pudo iniciar la llamada', getErrorMessage(error));
    }
  }, []);

  const handleEntregar = useCallback(
    async (pedidoId: string, metodoPago: string | null, estadoPago: PaymentStatus | null) => {
      setDeliveringOrderId(pedidoId);

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
      } catch (error) {
        console.error('Error updating delivered order:', error);
        Alert.alert('No se pudo completar la entrega', 'Intenta nuevamente.');
      } finally {
        setDeliveringOrderId(null);
      }
    },
    [showInlineFeedback]
  );

  const handleEntregarConExcepcion = useCallback(
    (pedidoId: string, metodoPago: string | null, estadoPago: PaymentStatus | null) => {
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
                } catch (error) {
                  console.error('Error updating delivered order with exception:', error);
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
    setSelectedOrder(order);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedOrder(null);
  }, []);

  const emptyMessage = useMemo(() => {
    if (isLoading) {
      return 'Cargando pedidos en camino...';
    }

    return 'No hay pedidos activos para reparto.';
  }, [isLoading]);

  const listBottomPadding = useMemo(() => 28 + insets.bottom + 72, [insets.bottom]);

  const listHeader = useMemo(
    () => (
      <DeliveryHeader
        totalOrders={activeOrders.length}
        lastUpdatedAt={lastUpdatedAt}
        inlineFeedback={inlineFeedback}
      />
    ),
    [activeOrders.length, inlineFeedback, lastUpdatedAt]
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
          data={activeOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          ListHeaderComponent={listHeader}
          contentContainerStyle={
            activeOrders.length === 0
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
              <TouchableOpacity style={styles.detailCloseButton} onPress={closeDetail}>
                <Text style={styles.detailCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

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
                disabled={selectedIsDelivering}>
                <Text style={styles.exceptionButtonText}>
                  {selectedIsDelivering ? 'Entregando...' : 'Entregar con excepcion'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.detailBottomActions}>
              <TouchableOpacity
                style={[styles.detailSecondaryButton, !selectedClient?.telefono && styles.buttonDisabled]}
                onPress={() => void handleCall(selectedClient?.telefono ?? null)}>
                <Text style={styles.detailSecondaryButtonText}>Llamar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.detailSecondaryButton} onPress={closeDetail}>
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

      {fetchErrorMessage ? (
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
