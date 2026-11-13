import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { Platform, Alert } from 'react-native';
import { logger } from '../utils/logger';

// Já perguntamos nesta sessão? O Android 13+ mostra um diálogo por permissão de mídia
// (fotos, vídeos, áudio). Pedir de novo a cada foto fazia o diálogo aparecer em toda captura.
let galleryPermissionAsked = false;

/**
 * Pede permissão para salvar fotos na galeria, no máximo UMA vez por sessão.
 * Usa writeOnly: salvar não precisa ler a galeria, então não pede acesso a áudio nem a
 * "todas as fotos". Se o usuário negar, a cópia na galeria é pulada em silêncio, pois
 * é só um backup extra (o arquivo principal fica no armazenamento do app).
 * Retorna true se a permissão estiver concedida.
 */
export async function requestGalleryPermission(): Promise<boolean> {
  try {
    const { status: existing, canAskAgain } = await MediaLibrary.getPermissionsAsync(true);
    if (existing === 'granted') return true;
    if (galleryPermissionAsked || !canAskAgain) return false;

    galleryPermissionAsked = true;
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    return status === 'granted';
  } catch (error) {
    logger.error('Erro ao solicitar permissão da galeria:', error);
    return false;
  }
}

/**
 * Salva uma foto na galeria do dispositivo
 * @param photoUri - URI da foto a ser salva
 * @param albumName - Nome do álbum onde salvar (opcional, padrão: 'Obras Teccel')
 * @returns true se a foto foi salva com sucesso
 */
export async function savePhotoToGallery(
  photoUri: string,
  albumName: string = 'Obras Teccel'
): Promise<boolean> {
  try {
    // Verificar permissão
    const hasPermission = await requestGalleryPermission();
    if (!hasPermission) {
      logger.warn('Permissão para salvar na galeria não concedida');
      return false;
    }

    // Salva na galeria principal (rolo da câmera) apenas.
    // Não adicionamos a nenhum álbum específico porque:
    //  - copy=true → duplica a foto (aparece no rolo E no álbum)
    //  - copy=false → dispara o dialog "Permitir que o app modifique essa foto?" no Android 10+
    // Uma cópia no rolo da câmera é suficiente como backup seguro.
    await MediaLibrary.createAssetAsync(photoUri);

    return true;
  } catch (error) {
    logger.error('Erro ao salvar foto na galeria:', error);
    return false;
  }
}

/**
 * Salva uma foto renderizada (com placa queimada) na galeria
 * @param renderedUri - URI da foto já renderizada com placa
 * @param albumName - Nome do álbum onde salvar
 */
export async function saveRenderedPhotoToGallery(
  renderedUri: string,
  albumName: string = 'Obras Teccel'
): Promise<boolean> {
  try {
    // A foto renderizada já está salva no cache do FileSystem
    // Podemos salvá-la diretamente na galeria
    return await savePhotoToGallery(renderedUri, albumName);
  } catch (error) {
    logger.error('Erro ao salvar foto renderizada na galeria:', error);
    return false;
  }
}

/**
 * Salva múltiplas fotos na galeria em batch
 * @param photoUris - Array de URIs das fotos
 * @param albumName - Nome do álbum
 * @returns Número de fotos salvas com sucesso
 */
export async function saveMultiplePhotosToGallery(
  photoUris: string[],
  albumName: string = 'Obras Teccel'
): Promise<number> {
  let successCount = 0;

  for (const uri of photoUris) {
    const success = await savePhotoToGallery(uri, albumName);
    if (success) {
      successCount++;
    }
  }

  return successCount;
}

/**
 * Verifica se o app tem permissão para salvar na galeria
 */
export async function hasGalleryPermission(): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.getPermissionsAsync(true);
    return status === 'granted';
  } catch (error) {
    return false;
  }
}
