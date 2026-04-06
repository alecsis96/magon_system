import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getRepartoRuntimeSnapshot,
  subscribeRepartoRuntime,
  type RepartoTelemetryEntry,
} from '@/src/features/reparto/runtime-metrics';
import { supabase } from '@/src/lib/supabase';

type HealthLevel = 'ok' | 'warn' | 'error';

type StatusItem = {
  label: string;
  value: string;
  level: HealthLevel;
};

function formatPermission(status: string) {
  if (status === 'granted') {
    return { value: 'Concedido', level: 'ok' as const };
  }

  if (status === 'denied') {
    return { value: 'Denegado', level: 'error' as const };
  }

  return { value: 'Pendiente', level: 'warn' as const };
}

function formatRelative(timestamp: Date | null, now: number) {
  if (!timestamp) {
    return 'sin datos';
  }

  const seconds = Math.max(0, Math.floor((now - timestamp.getTime()) / 1000));
  if (seconds < 60) {
    return `hace ${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `hace ${minutes}m`;
  }

  return `hace ${Math.floor(minutes / 60)}h`;
}

function formatRelativeFromIso(timestampIso: string | null, now: number) {
  if (!timestampIso) {
    return 'sin datos';
  }

  const parsed = new Date(timestampIso);

  if (Number.isNaN(parsed.getTime())) {
    return 'sin datos';
  }

  return formatRelative(parsed, now);
}

function formatLatencyMs(value: number | null) {
  if (value === null) {
    return 'sin datos';
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  return `${(value / 1000).toFixed(2)} s`;
}

function formatTelemetryEntry(entry: RepartoTelemetryEntry, now: number) {
  const at = formatRelativeFromIso(entry.at, now);
  const base = `${entry.action} (${at})`;

  if (!entry.detail) {
    return base;
  }

  return `${base}: ${entry.detail}`;
}

export default function EstadoScreen() {
  const [isChecking, setIsChecking] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [relativeClock, setRelativeClock] = useState(() => Date.now());
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [pushRegistrationStatus, setPushRegistrationStatus] = useState<
    'idle' | 'registering' | 'ready' | 'error'
  >('idle');
  const [pushRegistrationMessage, setPushRegistrationMessage] = useState('Sin registrar');
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(() => getRepartoRuntimeSnapshot());

  const registerPushToken = useCallback(async () => {
    setPushRegistrationStatus('registering');
    setPushRegistrationMessage('Registrando dispositivo...');

    try {
      if (!Device.isDevice) {
        setPushRegistrationStatus('error');
        setPushRegistrationMessage('Solo disponible en dispositivo fisico');
        return;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

      if (!projectId) {
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
          ignoreDuplicates: true,
        }
      );

      if (error) {
        throw error;
      }

      setPushRegistrationStatus('ready');
      setPushRegistrationMessage(`Push listo: ${expoPushToken.data.slice(0, 18)}...`);
    } catch (error) {
      console.error('Error registering push token', error);
      setPushRegistrationStatus('error');
      setPushRegistrationMessage('No se pudo registrar el token push');
    }
  }, []);

  const runDiagnostics = useCallback(async () => {
    setIsChecking(true);
    setCheckError(null);

    try {
      const [cameraPermission, locationPermission, notificationPermission] = await Promise.all([
        ImagePicker.getCameraPermissionsAsync(),
        Location.getForegroundPermissionsAsync(),
        Notifications.getPermissionsAsync(),
      ]);

      const connectivity = await (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        try {
          const response = await fetch('https://www.google.com/generate_204', {
            method: 'GET',
            signal: controller.signal,
          });
          return response.ok;
        } catch {
          return false;
        } finally {
          clearTimeout(timeoutId);
        }
      })();

      const supabaseOnline = await (async () => {
        const { error } = await supabase.from('pedidos').select('id', { head: true, count: 'exact' }).limit(1);
        return !error;
      })();

      const realtimeOnline = await new Promise<boolean>((resolve) => {
        const channel = supabase.channel(`app-repartidor-health-${Date.now()}`);
        let settled = false;

        const finish = (value: boolean) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutId);
          resolve(value);
          void channel.unsubscribe();
        };

        const timeoutId = setTimeout(() => {
          finish(false);
        }, 3200);

        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            finish(true);
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            finish(false);
          }
        });
      });

      const camera = formatPermission(cameraPermission.status);
      const location = formatPermission(locationPermission.status);
      const notifications = formatPermission(notificationPermission.status);

      setStatuses([
        {
          label: 'Conectividad internet',
          value: connectivity ? 'Online' : 'Sin conexion',
          level: connectivity ? 'ok' : 'error',
        },
        {
          label: 'Supabase API',
          value: supabaseOnline ? 'Disponible' : 'No disponible',
          level: supabaseOnline ? 'ok' : 'error',
        },
        {
          label: 'Canal en tiempo real',
          value: realtimeOnline ? 'Conectado' : 'Sin conexion',
          level: realtimeOnline ? 'ok' : 'warn',
        },
        {
          label: 'Permiso de camara',
          value: camera.value,
          level: camera.level,
        },
        {
          label: 'Permiso de ubicacion',
          value: location.value,
          level: location.level,
        },
        {
          label: 'Permiso de notificaciones',
          value: notifications.value,
          level: notifications.level,
        },
      ]);
      setCheckedAt(new Date());
    } catch (error) {
      console.error('Error checking status screen diagnostics', error);
      setCheckError('No se pudo completar el chequeo. Volve a intentar en unos segundos.');
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    void runDiagnostics();
  }, [runDiagnostics]);

  useEffect(() => {
    void registerPushToken();
  }, [registerPushToken]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRelativeClock(Date.now());
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeRepartoRuntime((snapshot) => {
      setRuntimeSnapshot(snapshot);
    });

    return unsubscribe;
  }, []);

  const globalState = useMemo(() => {
    if (statuses.some((item) => item.level === 'error')) {
      return { label: 'Atencion requerida', level: 'error' as const };
    }

    if (statuses.some((item) => item.level === 'warn')) {
      return { label: 'Operativo con advertencias', level: 'warn' as const };
    }

    return { label: 'Sistema operativo', level: 'ok' as const };
  }, [statuses]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={isChecking} onRefresh={() => void runDiagnostics()} />}>
        <View
          style={[
            styles.heroCard,
            globalState.level === 'ok'
              ? styles.heroCardOk
              : globalState.level === 'warn'
                ? styles.heroCardWarn
                : styles.heroCardError,
          ]}>
          <Text style={styles.heroEyebrow}>Estado del sistema</Text>
          <Text style={styles.heroTitle}>{globalState.label}</Text>
          <Text style={styles.heroSubtitle}>Ultimo chequeo: {formatRelative(checkedAt, relativeClock)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push del dispositivo</Text>
          <View
            style={[
              styles.pushCard,
              pushRegistrationStatus === 'ready'
                ? styles.pushCardReady
                : pushRegistrationStatus === 'error'
                  ? styles.pushCardError
                  : styles.pushCardNeutral,
            ]}>
            <Text style={styles.pushLabel}>Estado push</Text>
            <Text style={styles.pushValue}>{pushRegistrationMessage}</Text>

            <TouchableOpacity
              style={styles.pushRetryButton}
              onPress={() => void registerPushToken()}
              disabled={pushRegistrationStatus === 'registering'}>
              <Text style={styles.pushRetryButtonText}>
                {pushRegistrationStatus === 'registering'
                  ? 'Registrando...'
                  : pushRegistrationStatus === 'ready'
                    ? 'Reintentar registro'
                    : 'Registrar token'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Salud operativa</Text>
          {isChecking && statuses.length === 0 ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="small" color="#0f172a" />
              <Text style={styles.loadingText}>Chequeando conectividad, realtime y permisos...</Text>
            </View>
          ) : (
            statuses.map((item) => (
              <View key={item.label} style={styles.statusCard}>
                <Text style={styles.statusLabel}>{item.label}</Text>
                <Text
                  style={[
                    styles.statusValue,
                    item.level === 'ok'
                      ? styles.statusValueOk
                      : item.level === 'warn'
                        ? styles.statusValueWarn
                        : styles.statusValueError,
                  ]}>
                  {item.value}
                </Text>
              </View>
            ))
          )}

          {checkError ? <Text style={styles.errorText}>{checkError}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Metricas de reparto (runtime)</Text>

          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Latencia ultima actualizacion de pedidos</Text>
            <Text style={styles.statusValue}>{formatLatencyMs(runtimeSnapshot.lastOrdersRefreshLatencyMs)}</Text>
          </View>

          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Ultima sync exitosa</Text>
            <Text style={styles.statusValue}>
              {formatRelativeFromIso(runtimeSnapshot.lastSuccessfulSyncAt, relativeClock)}
            </Text>
          </View>

          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Ultimo evento realtime</Text>
            <Text style={styles.statusValue}>
              {formatRelativeFromIso(runtimeSnapshot.lastRealtimeEventAt, relativeClock)}
            </Text>
          </View>

          <Text style={styles.statusLabel}>Ultimas acciones criticas</Text>
          {runtimeSnapshot.telemetry.length === 0 ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusValue}>Sin eventos registrados</Text>
            </View>
          ) : (
            runtimeSnapshot.telemetry.slice(0, 8).map((entry) => (
              <View key={entry.id} style={styles.telemetryCard}>
                <Text style={styles.telemetryAction}>{formatTelemetryEntry(entry, relativeClock)}</Text>
                <Text
                  style={[
                    styles.telemetryStatus,
                    entry.status === 'ok' ? styles.telemetryStatusOk : styles.telemetryStatusError,
                  ]}>
                  {entry.status === 'ok' ? 'ok' : 'error'}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones de ayuda</Text>
          <TouchableOpacity style={styles.actionButtonPrimary} onPress={() => void runDiagnostics()}>
            <Text style={styles.actionButtonPrimaryText}>{isChecking ? 'Revisando...' : 'Revisar ahora'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButtonSecondary} onPress={() => void Linking.openSettings()}>
            <Text style={styles.actionButtonSecondaryText}>Abrir configuracion de permisos</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef2f7',
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 14,
  },
  heroCard: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 6,
  },
  heroCardOk: {
    backgroundColor: '#0f766e',
  },
  heroCardWarn: {
    backgroundColor: '#92400e',
  },
  heroCardError: {
    backgroundColor: '#991b1b',
  },
  heroEyebrow: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '800',
    color: '#e2e8f0',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
  },
  heroSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
  },
  section: {
    borderRadius: 20,
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  pushCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  pushCardNeutral: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  pushCardReady: {
    backgroundColor: '#ecfdf5',
    borderColor: '#86efac',
  },
  pushCardError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  pushLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pushValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  pushRetryButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pushRetryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  loadingCard: {
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  statusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  statusValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  statusValueOk: {
    color: '#047857',
  },
  statusValueWarn: {
    color: '#b45309',
  },
  statusValueError: {
    color: '#b91c1c',
  },
  telemetryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  telemetryAction: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  telemetryStatus: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  telemetryStatusOk: {
    color: '#047857',
  },
  telemetryStatusError: {
    color: '#b91c1c',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b91c1c',
  },
  actionButtonPrimary: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  actionButtonSecondary: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
});
