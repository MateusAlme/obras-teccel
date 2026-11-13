/**
 * Permissão para escolher foto da galeria.
 *
 * No Android 13 (API 33) ou mais novo o seletor de fotos do sistema, que o expo-image-picker usa,
 * NÃO precisa de permissão, e a política do Google Play proíbe declarar READ_MEDIA_IMAGES para isso.
 * Por isso, nessas versões não se pede nada e a escolha segue direto. Em versões mais antigas do
 * Android continua pedindo a permissão de leitura como antes.
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export async function requestMediaLibraryPermissionsCompat(): Promise<ImagePicker.MediaLibraryPermissionResponse> {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    return { status: ImagePicker.PermissionStatus.GRANTED, granted: true, canAskAgain: true, expires: 'never' } as ImagePicker.MediaLibraryPermissionResponse;
  }
  return ImagePicker.requestMediaLibraryPermissionsAsync();
}
