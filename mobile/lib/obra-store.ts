/**
 * obra-store — armazenamento local de obras com UMA CHAVE POR OBRA.
 *
 * Motivação de performance (offline-first em celulares fracos):
 * o modelo antigo guardava TODAS as obras num único blob JSON (`@obras_local`,
 * eventualmente dividido em chunks). Cada salvamento reserializava a lista
 * inteira e cada leitura fazia JSON.parse do dataset completo — tudo na thread
 * de JS, travando a UI durante o registro em campo.
 *
 * Aqui cada obra vive em `@obra:<id>` e um índice leve (`@obras_index`, apenas
 * a lista de ids) permite carregar/atualizar obras de forma granular:
 *  - salvar 1 obra   → escreve 1 chave pequena (não reserializa o resto);
 *  - ler 1 obra      → lê 1 chave (não parseia tudo);
 *  - listar todas    → índice + multiGet (compatível com o fluxo antigo).
 *
 * Migração automática e idempotente do formato legado acontece na primeira
 * chamada da sessão (ver ensureMigrated). O índice é escrito por último e só
 * então as chaves legadas são removidas — se o app cair no meio, a migração
 * simplesmente roda de novo sem perder dados.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocalObra } from './offline-sync';
import { logger } from '../utils/logger';

const OBRA_KEY_PREFIX = '@obra:';
const OBRAS_INDEX_KEY = '@obras_index';

// Chaves do formato legado (blob único + chunks). Mantidas apenas para migração.
const LEGACY_OBRAS_KEY = '@obras_local';
const LEGACY_CHUNK_KEY = '@obras_local_c';
const LEGACY_CHUNK_COUNT = '@obras_local_n';

const obraKey = (id: string) => `${OBRA_KEY_PREFIX}${id}`;

/** Prefixos/chaves usados pela store — exportado para monitoramento de memória. */
export const OBRA_STORE_KEYS = {
  prefix: OBRA_KEY_PREFIX,
  index: OBRAS_INDEX_KEY,
} as const;

// ---------------------------------------------------------------------------
// Índice (lista de ids)
// ---------------------------------------------------------------------------

async function readIndex(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(OBRAS_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function writeIndex(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(OBRAS_INDEX_KEY, JSON.stringify(ids));
}

/** Constrói um Map id→obra (última ocorrência vence) descartando obras sem id. */
function toObraMap(list: LocalObra[]): Map<string, LocalObra> {
  const map = new Map<string, LocalObra>();
  for (const obra of list) {
    const id = obra?.id;
    if (typeof id === 'string' && id.length > 0) {
      map.set(id, obra);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Migração do formato legado
// ---------------------------------------------------------------------------

let migrated = false;
let migrationPromise: Promise<void> | null = null;

/** Lê obras no formato legado (blob único OU chunks). */
async function readLegacyObras(): Promise<LocalObra[]> {
  const nRaw = await AsyncStorage.getItem(LEGACY_CHUNK_COUNT);
  if (nRaw) {
    const n = parseInt(nRaw, 10);
    if (n > 0) {
      const keys = Array.from({ length: n }, (_, i) => `${LEGACY_CHUNK_KEY}${i}`);
      const pairs = await AsyncStorage.multiGet(keys);
      const all: LocalObra[] = [];
      for (const [, chunk] of pairs) {
        if (chunk) {
          try {
            all.push(...(JSON.parse(chunk) as LocalObra[]));
          } catch (e) {
            logger.error('❌ [obra-store] Falha ao parsear chunk legado:', e);
          }
        }
      }
      return all;
    }
  }
  const raw = await AsyncStorage.getItem(LEGACY_OBRAS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LocalObra[];
  } catch (e) {
    logger.error('❌ [obra-store] Falha ao parsear blob legado:', e);
    return [];
  }
}

async function removeLegacyKeys(): Promise<void> {
  const nRaw = await AsyncStorage.getItem(LEGACY_CHUNK_COUNT);
  const n = nRaw ? parseInt(nRaw, 10) : 0;
  const toRemove = [
    LEGACY_OBRAS_KEY,
    LEGACY_CHUNK_COUNT,
    ...Array.from({ length: n }, (_, i) => `${LEGACY_CHUNK_KEY}${i}`),
  ];
  await AsyncStorage.multiRemove(toRemove);
}

async function doMigrate(): Promise<void> {
  // Se o índice já existe, consideramos a migração concluída.
  const indexRaw = await AsyncStorage.getItem(OBRAS_INDEX_KEY);
  if (indexRaw !== null) return;

  const legacy = await readLegacyObras();
  if (legacy.length === 0) {
    // Nada a migrar — inicializa índice vazio para não repetir a checagem.
    await writeIndex([]);
    return;
  }

  const map = toObraMap(legacy);
  const ids = Array.from(map.keys());
  const pairs: [string, string][] = ids.map((id) => [obraKey(id), JSON.stringify(map.get(id))]);

  // 1) grava as obras individuais, 2) grava o índice, 3) só então remove o legado.
  await AsyncStorage.multiSet(pairs);
  await writeIndex(ids);
  await removeLegacyKeys();

  logger.sync(`🔀 [obra-store] Migração concluída: ${ids.length} obra(s) para chaves individuais.`);
}

function ensureMigrated(): Promise<void> {
  if (migrated) return Promise.resolve();
  if (!migrationPromise) {
    migrationPromise = doMigrate()
      .then(() => {
        migrated = true;
      })
      .catch((e) => {
        // Libera para nova tentativa na próxima chamada.
        migrationPromise = null;
        logger.error('❌ [obra-store] Erro na migração:', e);
        throw e;
      });
  }
  return migrationPromise;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Retorna todas as obras locais. Compatível com o antigo readObrasRaw. */
export async function getAllObras(): Promise<LocalObra[]> {
  await ensureMigrated();
  const ids = await readIndex();
  if (!ids.length) return [];
  const pairs = await AsyncStorage.multiGet(ids.map(obraKey));
  const out: LocalObra[] = [];
  for (const [, value] of pairs) {
    if (value) {
      try {
        out.push(JSON.parse(value) as LocalObra);
      } catch (e) {
        logger.error('❌ [obra-store] Falha ao parsear obra individual:', e);
      }
    }
  }
  return out;
}

/** Lê uma única obra por id sem parsear o dataset inteiro. */
export async function getObraById(id: string): Promise<LocalObra | null> {
  await ensureMigrated();
  const value = await AsyncStorage.getItem(obraKey(id));
  if (!value) return null;
  try {
    return JSON.parse(value) as LocalObra;
  } catch (e) {
    logger.error('❌ [obra-store] Falha ao parsear obra por id:', e);
    return null;
  }
}

/** Salva/atualiza UMA obra (escrita granular — não reserializa as demais). */
export async function saveObra(obra: LocalObra): Promise<void> {
  await ensureMigrated();
  const id = obra?.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('[obra-store] saveObra: obra sem id válido');
  }
  await AsyncStorage.setItem(obraKey(id), JSON.stringify(obra));
  const ids = await readIndex();
  if (!ids.includes(id)) {
    await writeIndex([...ids, id]);
  }
}

/** Salva/atualiza várias obras de uma vez, preservando as demais. */
export async function saveManyObras(list: LocalObra[]): Promise<void> {
  await ensureMigrated();
  const map = toObraMap(list);
  if (map.size === 0) return;
  const pairs: [string, string][] = Array.from(map.entries()).map(([id, obra]) => [
    obraKey(id),
    JSON.stringify(obra),
  ]);
  await AsyncStorage.multiSet(pairs);
  const ids = await readIndex();
  const set = new Set(ids);
  let changed = false;
  for (const id of map.keys()) {
    if (!set.has(id)) {
      ids.push(id);
      set.add(id);
      changed = true;
    }
  }
  if (changed) await writeIndex(ids);
}

/** Remove uma obra (chave + entrada do índice). */
export async function removeObra(id: string): Promise<void> {
  await ensureMigrated();
  await AsyncStorage.removeItem(obraKey(id));
  const ids = await readIndex();
  if (ids.includes(id)) {
    await writeIndex(ids.filter((x) => x !== id));
  }
}

/**
 * Substitui TODO o conjunto de obras. Compatível com o antigo writeObrasRaw —
 * usado por fluxos que já carregam a lista inteira (sync, dedupe, migrações).
 * Escreve as obras informadas e remove as que não estão mais presentes.
 */
export async function replaceAllObras(list: LocalObra[]): Promise<void> {
  await ensureMigrated();
  const map = toObraMap(list);
  const newIds = Array.from(map.keys());
  const newSet = new Set(newIds);

  const oldIds = await readIndex();
  const toRemove = oldIds.filter((id) => !newSet.has(id)).map(obraKey);

  if (map.size > 0) {
    const pairs: [string, string][] = newIds.map((id) => [obraKey(id), JSON.stringify(map.get(id))]);
    await AsyncStorage.multiSet(pairs);
  }
  await writeIndex(newIds);
  if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
}

/**
 * Atualiza campos de uma obra existente sem sobrescrever o resto do objeto.
 * Retorna false se a obra não existir localmente.
 */
export async function patchObra(id: string, patch: Partial<LocalObra>): Promise<boolean> {
  const current = await getObraById(id);
  if (!current) return false;
  await saveObra({ ...current, ...patch, id: current.id });
  return true;
}
