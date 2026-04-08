import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { supabase } from '@/src/lib/supabase';

export type CaptureClientDataResult =
  | { status: 'cancelled' }
  | {
      status: 'success';
      publicUrl: string;
      latitude: number;
      longitude: number;
    };

function shouldFallbackWithoutFotoValida(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes('foto_valida') && normalized.includes('column');
}

export function getRepartoErrorMessage(error: unknown) {
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

export async function captureClientData(clienteId: string): Promise<CaptureClientDataResult> {
  const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();

  if (cameraPermission.status !== 'granted') {
    throw new Error('Necesitamos acceso a la camara para capturar la fachada.');
  }

  const locationPermission = await Location.requestForegroundPermissionsAsync();

  if (locationPermission.status !== 'granted') {
    throw new Error('Necesitamos tu ubicacion para guardar la entrega del cliente.');
  }

  const photoResult = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.5,
    base64: true,
    allowsEditing: false,
  });

  if (photoResult.canceled || !photoResult.assets[0]) {
    return { status: 'cancelled' };
  }

  const photoAsset = photoResult.assets[0];

  if (!photoAsset.base64) {
    throw new Error('No se pudo obtener la foto en base64');
  }

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

  const basePayload = {
    latitud: currentPosition.coords.latitude,
    longitud: currentPosition.coords.longitude,
    url_foto_fachada: publicUrl,
  };

  const { error: updateErrorWithValidation } = await supabase
    .from('clientes')
    .update({
      ...basePayload,
      foto_valida: true,
    })
    .eq('id', clienteId);

  if (updateErrorWithValidation) {
    if (!shouldFallbackWithoutFotoValida(updateErrorWithValidation.message ?? '')) {
      throw updateErrorWithValidation;
    }

    const { error: fallbackUpdateError } = await supabase
      .from('clientes')
      .update(basePayload)
      .eq('id', clienteId);

    if (fallbackUpdateError) {
      throw fallbackUpdateError;
    }
  }

  return {
    status: 'success',
    publicUrl,
    latitude: currentPosition.coords.latitude,
    longitude: currentPosition.coords.longitude,
  };
}
