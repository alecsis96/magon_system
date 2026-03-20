import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { decode } from 'base64-arraybuffer';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
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

const GOOGLE_MAPS_BASE_URL = 'https://www.google.com/maps/search/?api=1&query=';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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

function formatPaymentMethod(value: string | null) {
  if (value === 'efectivo') {
    return 'Efectivo';
  }

  if (value === 'transferencia') {
    return 'Transferencia';
  }

  return 'Sin definir';
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

export default function DeliveryHomeScreen() {
  const insets = useSafeAreaInsets();
  const [activeOrders, setActiveOrders] = useState<DeliveryOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [capturingClientId, setCapturingClientId] = useState<string | null>(null);
  const [deliveringOrderId, setDeliveringOrderId] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [fetchErrorMessage, setFetchErrorMessage] = useState<string | null>(null);
  const [pushRegistrationStatus, setPushRegistrationStatus] = useState<
    'idle' | 'registering' | 'ready' | 'error'
  >('idle');
  const [pushRegistrationMessage, setPushRegistrationMessage] = useState(
    'Sin registrar',
  );

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
  }, []);

  const registerPushToken = useCallback(async () => {
    setPushRegistrationStatus('registering');
    setPushRegistrationMessage('Registrando dispositivo...');

    if (!Device.isDevice) {
      console.log('Push notifications require a physical device.');
      setPushRegistrationStatus('error');
      setPushRegistrationMessage('Solo disponible en dispositivo fisico');
      return;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('Expo projectId not found. Push token registration skipped.');
      setPushRegistrationStatus('error');
      setPushRegistrationMessage('Falta projectId de Expo');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#ea580c',
      });
    }

    const permission = await Notifications.getPermissionsAsync();
    let finalStatus = permission.status;

    if (finalStatus !== 'granted') {
      const request = await Notifications.requestPermissionsAsync();
      finalStatus = request.status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Push notification permission denied.');
      setPushRegistrationStatus('error');
      setPushRegistrationMessage('Permiso de notificaciones denegado');
      return;
    }

    const expoPushToken = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase.from('repartidor_push_tokens').upsert(
      {
        expo_push_token: expoPushToken.data,
        dispositivo_nombre: Device.deviceName ?? null,
        plataforma: Platform.OS,
        activo: true,
        actualizado_en: new Date().toISOString(),
      },
      {
        onConflict: 'expo_push_token',
      }
    );

    if (error) {
      throw error;
    }

    console.log('Expo push token registrado:', expoPushToken.data);
    setPushRegistrationStatus('ready');
    setPushRegistrationMessage(`Push listo: ${expoPushToken.data.slice(0, 18)}...`);
  }, []);

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

    void registerPushToken().catch((error) => {
      console.warn('Push registration skipped:', error);
      setPushRegistrationStatus('error');
      setPushRegistrationMessage(getErrorMessage(error));
    });
  }, [fetchPedidos, registerPushToken]);

  useEffect(() => {
    const subscription = supabase
      .channel('public:pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        console.log('Realtime pedidos: cambio recibido');
        Vibration.vibrate();
        void fetchPedidos().catch((error) => {
          console.error('Error refreshing delivery orders from realtime:', error);
          setFetchErrorMessage(getErrorMessage(error));
        });
      })
      .subscribe((status) => {
        console.log('Realtime pedidos status:', status);
        setRealtimeConnected(status === 'SUBSCRIBED');

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

        Alert.alert('Datos actualizados', 'Datos del cliente actualizados exitosamente.');
        await fetchPedidos();
      } catch (error) {
        console.error('Error capturing delivery client data:', error);
        Alert.alert('No se pudo guardar la captura', getErrorMessage(error));
      } finally {
        setCapturingClientId(null);
      }
    },
    [fetchPedidos]
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
        const payload: { estado: 'entregado'; estado_pago?: PaymentStatus } = {
          estado: 'entregado',
        };

        if (metodoPago === 'efectivo' && estadoPago === 'pendiente') {
          payload.estado_pago = 'pagado';
        }

        const { error } = await supabase.from('pedidos').update(payload).eq('id', pedidoId);

        if (error) {
          throw error;
        }

        setActiveOrders((currentOrders) => currentOrders.filter((order) => order.id !== pedidoId));
        Alert.alert('Pedido entregado', 'La entrega se registro correctamente.');
      } catch (error) {
        console.error('Error updating delivered order:', error);
        Alert.alert('No se pudo completar la entrega', 'Intenta nuevamente.');
      } finally {
        setDeliveringOrderId(null);
      }
    },
    []
  );

  const renderOrder = useCallback(
    ({ item }: { item: DeliveryOrder }) => {
      const client = item.clientes;
      const requiresCapture = !client?.latitud || !client?.url_foto_fachada;
      const isCapturing = capturingClientId === client?.id;
      const isDelivering = deliveringOrderId === item.id;

      return (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.cardHeader}>
              <View style={styles.titleGroup}>
                <Text style={styles.cardEyebrow}>Pedido #{item.id.slice(0, 8)}</Text>
                <Text style={styles.cardTitle}>{client?.nombre ?? 'Cliente sin asignar'}</Text>
              </View>

              <View
                style={[
                  styles.paymentBadge,
                  item.estado_pago === 'pagado' ? styles.paymentBadgePaid : styles.paymentBadgePending,
                ]}>
                <Text
                  style={[
                    styles.paymentBadgeText,
                    item.estado_pago === 'pagado' ? styles.paymentBadgeTextPaid : styles.paymentBadgeTextPending,
                  ]}>
                  {item.estado_pago === 'pagado' ? 'Pagado' : 'Pendiente'}
                </Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryLabel}>Cobro</Text>
                <Text style={styles.summaryValue}>{formatCurrency(item.total)}</Text>
              </View>

              <View style={styles.summaryTile}>
                <Text style={styles.summaryLabel}>Metodo</Text>
                <Text style={styles.summaryValue}>{formatPaymentMethod(item.metodo_pago)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.label}>Telefono</Text>
            <Text style={styles.value}>{client?.telefono ?? 'No disponible'}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.label}>Direccion / referencias</Text>
            <Text style={styles.notesText}>
              {client?.notas_entrega?.trim() || 'Sin direccion o referencias registradas'}
            </Text>
          </View>

          {requiresCapture ? (
            <View style={styles.captureAlert}>
              <Text style={styles.captureAlertTitle}>Nuevo cliente. Requiere captura</Text>
              <Text style={styles.captureAlertText}>
                Antes de entregar, registra GPS y foto de fachada para dejar la direccion confirmada.
              </Text>
            </View>
          ) : (
            <View style={styles.photoSection}>
              <Image source={{ uri: client.url_foto_fachada ?? undefined }} style={styles.photo} />
              <TouchableOpacity style={styles.routeButton} onPress={() => void handleOpenRoute(client)}>
                <Text style={styles.routeButtonText}>Ver ruta</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.actions}>
            {requiresCapture ? (
              <TouchableOpacity
                style={[styles.primaryButton, styles.captureButton, isCapturing && styles.buttonDisabled]}
                onPress={() => client?.id && void handleCaptureData(client.id)}
                disabled={!client?.id || isCapturing}>
                <Text style={styles.primaryButtonText}>
                  {isCapturing ? 'Capturando...' : 'Tomar foto y guardar GPS'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleCall(client?.telefono ?? null)}>
              <Text style={styles.secondaryButtonText}>Llamar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, (requiresCapture || isDelivering) && styles.buttonDisabled]}
              onPress={() => void handleEntregar(item.id, item.metodo_pago, item.estado_pago)}
              disabled={requiresCapture || isDelivering}>
              <Text style={styles.primaryButtonText}>{isDelivering ? 'Entregando...' : 'Entregar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [capturingClientId, deliveringOrderId, handleCall, handleCaptureData, handleEntregar, handleOpenRoute]
  );

  const emptyMessage = useMemo(() => {
    if (isLoading) {
      return 'Cargando pedidos en camino...';
    }

    return 'No hay pedidos activos para reparto.';
  }, [isLoading]);

  const listBottomPadding = useMemo(() => 28 + insets.bottom + 72, [insets.bottom]);

  const listHeader = useMemo(
    () => (
      <View style={styles.headerCard}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Reparto activo</Text>
          <Text style={styles.headerTitle}>Pedidos en camino</Text>
          <Text style={styles.headerSubtitle}>
            Gestiona entregas, cobro y captura de clientes nuevos desde una sola pantalla.
          </Text>
        </View>

        <View style={styles.headerStats}>
          <View style={styles.headerStatCard}>
            <Text style={styles.headerStatLabel}>Pedidos</Text>
            <Text style={styles.headerStatValue}>{activeOrders.length}</Text>
          </View>

          <View
            style={[
              styles.headerStatCard,
              realtimeConnected ? styles.connectionCardOnline : styles.connectionCardOffline,
            ]}>
            <Text style={styles.headerStatLabel}>Tiempo real</Text>
            <Text style={styles.headerStatValue}>{realtimeConnected ? 'Activo' : 'Polling'}</Text>
          </View>
        </View>

        <View
          style={[
            styles.pushCard,
            pushRegistrationStatus === 'ready'
              ? styles.pushCardReady
              : pushRegistrationStatus === 'error'
                ? styles.pushCardError
                : styles.pushCardNeutral,
          ]}>
          <View style={styles.pushCardCopy}>
            <Text style={styles.pushCardLabel}>Push del dispositivo</Text>
            <Text style={styles.pushCardValue}>{pushRegistrationMessage}</Text>
          </View>

          <TouchableOpacity
            style={styles.pushRetryButton}
            onPress={() => void registerPushToken()}
            disabled={pushRegistrationStatus === 'registering'}>
            <Text style={styles.pushRetryButtonText}>
              {pushRegistrationStatus === 'registering'
                ? 'Registrando...'
                : pushRegistrationStatus === 'ready'
                  ? 'Actualizar'
                  : 'Registrar'}
            </Text>
          </TouchableOpacity>
        </View>

        {fetchErrorMessage ? (
          <View style={styles.fetchErrorCard}>
            <Text style={styles.fetchErrorLabel}>Error de carga</Text>
            <Text style={styles.fetchErrorValue}>{fetchErrorMessage}</Text>
          </View>
        ) : null}
      </View>
    ),
    [
      activeOrders.length,
      fetchErrorMessage,
      pushRegistrationMessage,
      pushRegistrationStatus,
      realtimeConnected,
      registerPushToken,
    ]
  );

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
        />
      </View>
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
    marginBottom: 18,
    marginTop: 8,
    borderRadius: 26,
    backgroundColor: '#0f172a',
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
    gap: 16,
  },
  headerCopy: {
    gap: 6,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#f59e0b',
  },
  headerStats: {
    flexDirection: 'row',
    gap: 10,
  },
  pushCard: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    gap: 12,
  },
  pushCardNeutral: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pushCardReady: {
    backgroundColor: 'rgba(16,185,129,0.14)',
    borderColor: 'rgba(16,185,129,0.24)',
  },
  pushCardError: {
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderColor: 'rgba(239,68,68,0.24)',
  },
  pushCardCopy: {
    gap: 4,
  },
  pushCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#cbd5e1',
  },
  pushCardValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 20,
  },
  pushRetryButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  pushRetryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  fetchErrorCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
    backgroundColor: 'rgba(251,191,36,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  fetchErrorLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#fde68a',
  },
  fetchErrorValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fef3c7',
  },
  headerStatCard: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  connectionCardOnline: {
    borderColor: 'rgba(16,185,129,0.22)',
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  connectionCardOffline: {
    borderColor: 'rgba(245,158,11,0.22)',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  headerStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#cbd5e1',
  },
  headerStatValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#cbd5e1',
    lineHeight: 20,
  },
  listContent: {
    gap: 14,
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
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    gap: 12,
  },
  cardTop: {
    borderRadius: 22,
    backgroundColor: '#f8fafc',
    padding: 14,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  titleGroup: {
    flex: 1,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#f97316',
  },
  cardTitle: {
    marginTop: 6,
    fontSize: 21,
    fontWeight: '800',
    color: '#0f172a',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryTile: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#64748b',
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  paymentBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paymentBadgePaid: {
    backgroundColor: '#dcfce7',
  },
  paymentBadgePending: {
    backgroundColor: '#fee2e2',
  },
  paymentBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  paymentBadgeTextPaid: {
    color: '#166534',
  },
  paymentBadgeTextPending: {
    color: '#b91c1c',
  },
  infoCard: {
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#6b7280',
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  notesText: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 22,
  },
  captureAlert: {
    borderRadius: 20,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    padding: 15,
    gap: 6,
  },
  captureAlertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#c2410c',
  },
  captureAlertText: {
    fontSize: 14,
    color: '#9a3412',
    lineHeight: 20,
  },
  photoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  photo: {
    width: 82,
    height: 82,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
  },
  routeButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  routeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  captureButton: {
    backgroundColor: '#ea580c',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3730a3',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
