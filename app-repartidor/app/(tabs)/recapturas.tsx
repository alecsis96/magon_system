import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { captureClientData, getRepartoErrorMessage } from '@/src/features/reparto/capture-client-data';
import { recordCriticalAction } from '@/src/features/reparto/runtime-metrics';
import { supabase } from '@/src/lib/supabase';

type RecaptureClient = {
  id: string;
  nombre: string;
  telefono: string | null;
  notas_entrega: string | null;
  latitud: number | null;
  longitud: number | null;
  url_foto_fachada: string | null;
  foto_valida?: boolean | null;
};

function hasMissingCaptureData(client: RecaptureClient) {
  return !client.url_foto_fachada || client.latitud === null || client.longitud === null;
}

function requiresAdminRecapture(client: RecaptureClient) {
  return client.foto_valida === false;
}

function getCaptureStatus(client: RecaptureClient) {
  if (requiresAdminRecapture(client)) {
    return { label: 'Recaptura solicitada por admin', level: 'high' as const };
  }

  if (hasMissingCaptureData(client)) {
    return { label: 'Captura incompleta', level: 'medium' as const };
  }

  return { label: 'Sin pendiente', level: 'low' as const };
}

function isFotoValidaColumnError(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes('foto_valida') && normalized.includes('column');
}

function normalizeRecaptureRows(rawRows: unknown[]) {
  return rawRows.map((rawRow) => {
    const row = rawRow as RecaptureClient;

    return {
      id: row.id,
      nombre: row.nombre,
      telefono: row.telefono ?? null,
      notas_entrega: row.notas_entrega ?? null,
      latitud: row.latitud ?? null,
      longitud: row.longitud ?? null,
      url_foto_fachada: row.url_foto_fachada ?? null,
      foto_valida: typeof row.foto_valida === 'boolean' ? row.foto_valida : null,
    } satisfies RecaptureClient;
  });
}

export default function RecapturasScreen() {
  const [clients, setClients] = useState<RecaptureClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturingClientId, setCapturingClientId] = useState<string | null>(null);

  const loadPendingRecaptures = useCallback(async () => {
    const selectWithValidation =
      'id, nombre, telefono, notas_entrega, latitud, longitud, url_foto_fachada, foto_valida';
    const selectWithoutValidation = 'id, nombre, telefono, notas_entrega, latitud, longitud, url_foto_fachada';

    const baseQueryWithValidation = supabase
      .from('clientes')
      .select(selectWithValidation)
      .or('foto_valida.eq.false,url_foto_fachada.is.null,latitud.is.null,longitud.is.null')
      .order('nombre', { ascending: true });

    const { data, error } = await baseQueryWithValidation;

    if (error) {
      if (!isFotoValidaColumnError(error.message ?? '')) {
        throw error;
      }

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('clientes')
        .select(selectWithoutValidation)
        .or('url_foto_fachada.is.null,latitud.is.null,longitud.is.null')
        .order('nombre', { ascending: true });

      if (fallbackError) {
        throw fallbackError;
      }

      const normalizedFallback = normalizeRecaptureRows((fallbackData ?? []) as unknown[]);
      const pendingFallback = normalizedFallback.filter((client) => hasMissingCaptureData(client));
      setClients(pendingFallback);
      setErrorMessage(null);
      return;
    }

    const normalized = normalizeRecaptureRows((data ?? []) as unknown[]);
    const pending = normalized
      .filter((client) => requiresAdminRecapture(client) || hasMissingCaptureData(client))
      .sort((left, right) => {
        const leftScore = requiresAdminRecapture(left) ? 0 : 1;
        const rightScore = requiresAdminRecapture(right) ? 0 : 1;

        if (leftScore !== rightScore) {
          return leftScore - rightScore;
        }

        return left.nombre.localeCompare(right.nombre, 'es');
      });

    setClients(pending);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await loadPendingRecaptures();
      } catch (error) {
        const message = getRepartoErrorMessage(error);
        setErrorMessage(message);
        Alert.alert('No se pudo cargar recapturas', message);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, [loadPendingRecaptures]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await loadPendingRecaptures();
      recordCriticalAction('recapturas_refresh', 'ok');
    } catch (error) {
      const message = getRepartoErrorMessage(error);
      setErrorMessage(message);
      recordCriticalAction('recapturas_refresh', 'error', message);
      Alert.alert('No se pudo actualizar', message);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadPendingRecaptures]);

  const handleCaptureNow = useCallback(async (clienteId: string) => {
    setCapturingClientId(clienteId);

    try {
      const result = await captureClientData(clienteId);

      if (result.status === 'cancelled') {
        return;
      }

      setClients((current) => current.filter((client) => client.id !== clienteId));
      recordCriticalAction('recaptura_cliente', 'ok', `cliente:${clienteId}`);
      Alert.alert('Recaptura guardada', 'Foto y coordenadas actualizadas correctamente.');
    } catch (error) {
      const message = getRepartoErrorMessage(error);
      recordCriticalAction('recaptura_cliente', 'error', message);
      Alert.alert('No se pudo completar la recaptura', message);
    } finally {
      setCapturingClientId(null);
    }
  }, []);

  const emptyText = useMemo(() => {
    if (isLoading) {
      return 'Buscando recapturas pendientes...';
    }

    return 'No hay recapturas pendientes.';
  }, [isLoading]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>Recapturas</Text>
          <Text style={styles.headerSubtitle}>Pendientes: {clients.length}</Text>
          <Text style={styles.headerDescription}>
            Incluye solicitudes de admin y capturas incompletas, aunque no haya pedidos en camino.
          </Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorLabel}>Error operativo</Text>
            <Text style={styles.errorValue}>{errorMessage}</Text>
          </View>
        ) : null}

        <FlatList
          data={clients}
          keyExtractor={(item) => item.id}
          contentContainerStyle={clients.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
          renderItem={({ item }) => {
            const status = getCaptureStatus(item);
            const isCapturing = capturingClientId === item.id;

            return (
              <View style={styles.card}>
                <Text style={styles.clientName}>{item.nombre}</Text>
                <Text style={styles.metaText}>Telefono: {item.telefono ?? 'No disponible'}</Text>
                <Text style={styles.metaText}>Direccion / notas: {item.notas_entrega?.trim() || 'Sin referencias'}</Text>

                <View
                  style={[
                    styles.statusPill,
                    status.level === 'high'
                      ? styles.statusPillHigh
                      : status.level === 'medium'
                        ? styles.statusPillMedium
                        : styles.statusPillLow,
                  ]}>
                  <Text style={styles.statusPillText}>{status.label}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
                  disabled={isCapturing}
                  onPress={() => {
                    void handleCaptureNow(item.id);
                  }}>
                  <Text style={styles.captureButtonText}>{isCapturing ? 'Capturando...' : 'Capturar ahora'}</Text>
                </TouchableOpacity>
              </View>
            );
          }}
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
    paddingTop: 10,
  },
  headerCard: {
    borderRadius: 20,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fcd34d',
  },
  headerDescription: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
    lineHeight: 18,
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    marginBottom: 10,
  },
  errorLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b91c1c',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  errorValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7f1d1d',
  },
  listContent: {
    paddingBottom: 28,
    gap: 10,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  metaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillHigh: {
    backgroundColor: '#fee2e2',
  },
  statusPillMedium: {
    backgroundColor: '#ffedd5',
  },
  statusPillLow: {
    backgroundColor: '#dcfce7',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#7c2d12',
  },
  captureButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#ea580c',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
});
