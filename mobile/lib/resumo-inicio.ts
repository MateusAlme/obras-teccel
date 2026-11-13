/**
 * Dados da tela Início, lidos só do armazenamento local (funciona offline, sem consulta ao servidor).
 * Agrupa por número de obra, como a aba Obras, e conta fotos e serviços do padrão novo também.
 */
import {
  getLocalObras,
  getPendingObras,
  getSyncStatus,
  collectObraReferencedPhotoIds,
  type LocalObra,
} from './offline-sync';
import { getPendingPhotos } from './photo-backup';
import { getLocalServicos } from './servico-sync';
import { isAdminOrSupervisor, isObraVisibleForProfile } from './profile-rules';
import { SERVICO_PHOTO_MAP } from '../types/servico';

export type EstadoObraInicio = 'em_andamento' | 'concluida';

export interface ObraResumoInicio {
  numero: string;
  tipos: string[];
  fotos: number;
  servicos: number;
  estado: EstadoObraInicio;
  aguardandoEnvio: boolean;
  atualizadoEm: number;
}

export interface ResumoInicio {
  continuar: ObraResumoInicio[];
  recentes: ObraResumoInicio[];
  fotosNaFila: number;
  ultimaSincronizacao: string | null;
}

const tempo = (obra: LocalObra): number => {
  const bruto = (obra as any).last_modified || (obra as any).updated_at || obra.created_at || obra.data;
  const t = Date.parse(String(bruto || ''));
  return Number.isFinite(t) ? t : 0;
};

export async function carregarResumoInicio(equipe: string, role: string): Promise<ResumoInicio> {
  const todas = await getLocalObras();
  const idsNaFila = new Set<string>((await getPendingObras()).map((o) => String(o.id)));
  const admin = isAdminOrSupervisor(role);
  const visiveis = todas.filter((o) => {
    if (!admin && o.equipe !== equipe) return false;
    return isObraVisibleForProfile(o as any, role, equipe);
  });

  const grupos = new Map<string, { obras: LocalObra[] }>();
  for (const obra of visiveis) {
    const chave = String(obra.obra || obra.id).trim().toLowerCase();
    if (!chave) continue;
    const g = grupos.get(chave) || { obras: [] };
    g.obras.push(obra);
    grupos.set(chave, g);
  }

  const resumos: ObraResumoInicio[] = [];
  for (const { obras } of grupos.values()) {
    const fotosLegado = new Set<string>();
    let servicos = 0;
    let fotosServicos = 0;
    for (const o of obras) {
      collectObraReferencedPhotoIds(o as any).forEach((id) => fotosLegado.add(id));
      try {
        const lista = await getLocalServicos(o.id);
        servicos += lista.length;
        for (const s of lista) {
          for (const cat of SERVICO_PHOTO_MAP[s.tipo_servico] || []) {
            const valor = (s as any)[cat.field];
            if (Array.isArray(valor)) fotosServicos += valor.length;
          }
          if (Array.isArray((s as any).postes_data)) {
            for (const p of (s as any).postes_data) {
              for (const v of Object.values(p || {})) if (Array.isArray(v)) fotosServicos += v.length;
            }
          }
        }
      } catch {
        // sem serviços locais para esta obra
      }
    }
    const emAndamento = obras.some((o) => o.status !== 'finalizada');
    resumos.push({
      numero: String(obras[0].obra || obras[0].id),
      tipos: Array.from(new Set(obras.map((o) => String(o.tipo_servico || '')).filter(Boolean))),
      fotos: fotosLegado.size + fotosServicos,
      servicos,
      estado: emAndamento ? 'em_andamento' : 'concluida',
      aguardandoEnvio: obras.some((o) => idsNaFila.has(String(o.id))),
      atualizadoEm: Math.max(...obras.map(tempo)),
    });
  }

  resumos.sort((a, b) => b.atualizadoEm - a.atualizadoEm);

  // Só conta foto cuja obra ainda existe no aparelho (foto sem dono nunca será enviada).
  const donos = new Set<string>();
  for (const o of todas) {
    donos.add(o.id);
    if ((o as any).serverId) donos.add((o as any).serverId);
    const m = String(o.id || '').match(/^local_(\d+)_/);
    if (m) donos.add(`temp_${m[1]}`);
  }
  let fotosNaFila = 0;
  try {
    fotosNaFila = (await getPendingPhotos()).filter((f) => donos.has(f.obraId)).length;
  } catch {
    fotosNaFila = 0;
  }

  const status = await getSyncStatus();
  return {
    continuar: resumos.filter((r) => r.estado === 'em_andamento').slice(0, 12),
    recentes: resumos.slice(0, 5),
    fotosNaFila,
    ultimaSincronizacao: status.lastSyncAt,
  };
}

export const tempoRelativo = (iso: string | null): string => {
  if (!iso) return 'ainda não sincronizou';
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(min) || min < 0) return 'agora';
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
};
