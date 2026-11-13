/**
 * Recuperação de foto quando o Android mata o app com a câmera aberta.
 *
 * Em aparelhos com pouca memória o sistema encerra o processo enquanto a câmera está na frente. A
 * foto é gravada pela câmera, mas o app que a pediu já não existe para recebê-la. O expo-image-picker
 * guarda esse resultado e o devolve em `getPendingResultAsync()` na próxima abertura.
 *
 * Como o resultado não diz para qual campo a foto era, gravamos antes de abrir a câmera uma
 * "intenção" (obra, tipo, poste). Ao reabrir o app, a foto pendente entra no backup com essa
 * intenção e a reconciliação de fotos soltas a reanexa à obra.
 *
 * Limite conhecido: a foto recuperada vem sem a placa gravada na imagem (a placa é aplicada depois
 * que a câmera devolve a foto). Ela segue com GPS vazio e é marcada como recuperada.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { backupPhoto } from './photo-backup';

const INTENT_KEY = '@camera_intent';
const MAX_INTENT_AGE_MS = 6 * 60 * 60 * 1000; // intenção velha demais não é confiável

export interface CameraIntent {
  obraId: string;
  tipoFoto: string;
  index: number;
  criadoEm: number;
}

export const registrarIntencaoCamera = async (obraId: string, tipoFoto: string, index = 0): Promise<void> => {
  try {
    const intent: CameraIntent = { obraId, tipoFoto, index, criadoEm: Date.now() };
    await AsyncStorage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch {
    // sem intenção só perde a recuperação; nunca atrapalha a captura
  }
};

export const limparIntencaoCamera = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(INTENT_KEY);
  } catch {
    // ignora
  }
};

let recuperando = false;

/**
 * Chame ao abrir o app, antes da reconciliação de fotos soltas. Devolve quantas fotos recuperou.
 * Nunca lança: falha aqui não pode impedir o app de abrir.
 */
export const recuperarFotoPendenteDaCamera = async (): Promise<number> => {
  if (Platform.OS !== 'android' || recuperando) return 0;
  recuperando = true;
  try {
    const bruto0 = (await ImagePicker.getPendingResultAsync()) as any;
    const pendentes: any[] = bruto0 ? [bruto0] : [];
    if (pendentes.length === 0) return 0;

    const bruto = await AsyncStorage.getItem(INTENT_KEY);
    const intent: CameraIntent | null = bruto ? JSON.parse(bruto) : null;
    const valida = !!intent && !!intent.obraId && !!intent.tipoFoto && Date.now() - intent.criadoEm < MAX_INTENT_AGE_MS;

    let recuperadas = 0;
    for (const resultado of pendentes) {
      if (!resultado || resultado.canceled || !Array.isArray(resultado.assets)) continue;
      for (const asset of resultado.assets) {
        if (!asset?.uri) continue;
        if (!valida) {
          // Sem saber o destino, a foto não pode ser vinculada a nenhum campo. Guardamos no backup
          // sob uma obra "recuperada" para não ficar só no cache da câmera, que o sistema limpa.
          console.warn('[camera-recovery] foto pendente sem intenção registrada; guardada sem vínculo');
          await backupPhoto(asset.uri, 'recuperada_sem_obra', 'antes' as any, 0, null, null, 'image/jpeg', 'camera');
          continue;
        }
        const meta = await backupPhoto(
          asset.uri,
          intent!.obraId,
          intent!.tipoFoto as any,
          intent!.index,
          null,
          null,
          'image/jpeg',
          'camera'
        );
        if (meta) recuperadas += 1;
      }
    }

    if (recuperadas > 0) console.log(`[camera-recovery] ${recuperadas} foto(s) recuperada(s) da câmera`);
    await limparIntencaoCamera();
    return recuperadas;
  } catch (error) {
    console.warn('[camera-recovery] falha ao recuperar foto pendente:', error);
    return 0;
  } finally {
    recuperando = false;
  }
};
