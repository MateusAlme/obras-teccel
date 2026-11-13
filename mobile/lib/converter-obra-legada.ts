/**
 * Liga o conversor puro (obra-legada-para-servico.ts) ao armazenamento local de serviços.
 * Plano: docs/migracao-legado/PLANO.md, Etapa 3.
 *
 * Só converte os tipos de foto simples. Serviços por poste, Transformador e Checklist continuam no
 * formulário antigo até a paridade de `postes-registro` e das telas dedicadas ser conferida.
 */
import { obraLegadaParaServico } from './obra-legada-para-servico';
import { getLocalServicos, saveServicoLocal } from './servico-sync';
import { getPhotoMetadatasByIds } from './photo-backup';
import type { ServicoLocal } from '../types/servico';

const FORA_DA_CONVERSAO = new Set([
  'Book de Aterramento',
  'Cava em Rocha',
  'Fundação Especial',
  'Linha Viva',
  'Transformador',
  'Checklist de Fiscalização',
]);

export const tipoPodeConverterObraLegada = (tipo?: string | null): boolean =>
  !!tipo && !FORA_DA_CONVERSAO.has(String(tipo).trim());

/**
 * As fotos da obra antiga guardam só o id. O padrão novo guarda um objeto por foto (id, uri, GPS),
 * que é o que o cartão, o visualizador e o envio esperam. Aqui o id vira esse objeto.
 */
async function fotosComoObjetos(servico: Record<string, any>, campos: string[]): Promise<void> {
  const ids = new Set<string>();
  for (const campo of campos) {
    const lista = servico[campo];
    if (!Array.isArray(lista)) continue;
    for (const item of lista) {
      if (typeof item === 'string' && !/^(https?:|file:|content:|\/)/i.test(item)) ids.add(item);
    }
  }
  const metas = ids.size > 0 ? await getPhotoMetadatasByIds(Array.from(ids)) : [];
  const porId = new Map(metas.map((m) => [m.id, m]));
  for (const campo of campos) {
    const lista = servico[campo];
    if (!Array.isArray(lista)) continue;
    servico[campo] = lista.map((item: any) => {
      if (typeof item !== 'string') return item;
      if (/^https?:/i.test(item)) return { id: item, url: item };
      if (/^(file:|content:|\/)/i.test(item)) return { id: item, uri: item };
      const m = porId.get(item);
      if (!m) return { id: item, uri: item };
      return {
        id: item,
        uri: m.compressedPath || m.backupPath || m.originalUri,
        url: m.supabaseUrl || m.uploadUrl || undefined,
        timestamp: Date.parse(m.timestamp) || Date.now(),
        latitude: m.latitude ?? null,
        longitude: m.longitude ?? null,
        utm_x: m.utmX ?? null,
        utm_y: m.utmY ?? null,
        utm_zone: m.utmZone ?? null,
      };
    });
  }
}

export type ResultadoConverterObra =
  | { ok: true; servico: ServicoLocal; jaExistia: boolean }
  | { ok: false; motivo: string };

/**
 * Cria (uma única vez) o serviço do padrão novo a partir de uma obra legada. Nunca altera a obra.
 * Se a contagem de fotos na origem e no destino não bater, não grava nada.
 */
export async function converterObraLegadaEmServico(obra: Record<string, any>): Promise<ResultadoConverterObra> {
  if (!tipoPodeConverterObraLegada(obra?.tipo_servico)) {
    return { ok: false, motivo: 'tipo de serviço ainda usa o formulário antigo' };
  }

  const resultado = obraLegadaParaServico(obra);
  if (!resultado.servico) return { ok: false, motivo: resultado.motivo || 'não foi possível converter' };
  if (!resultado.conferido) {
    const diferentes = resultado.campos.filter((c) => c.origem !== c.destino).map((c) => c.campo).join(', ');
    return { ok: false, motivo: `conferência de fotos falhou (${diferentes})` };
  }

  const alvo = resultado.servico;
  const obraId = String(alvo.obra_id);
  const existentes = await getLocalServicos(obraId);
  const igual = existentes.find((s) => String((s as any).client_pk || '') === alvo.client_pk);
  if (igual) return { ok: true, servico: igual, jaExistia: true };

  await fotosComoObjetos(alvo, resultado.campos.map((c) => c.campo));
  const servico = { ...alvo, id: `temp-${alvo.client_pk}` } as unknown as ServicoLocal;
  await saveServicoLocal(servico);
  return { ok: true, servico, jaExistia: false };
}
