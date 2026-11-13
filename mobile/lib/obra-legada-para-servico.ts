/**
 * Conversão sob demanda: obra legada (fotos nas colunas de `obras`) para serviço do padrão novo
 * (linha em `servicos`). Ver docs/migracao-legado/PLANO.md, Etapa 3.
 *
 * Função pura, sem acesso a disco ou rede, para poder ser testada isoladamente. Quem chama grava o
 * resultado (createServico / saveServicoLocal) e decide quando converter.
 *
 * Garantias:
 *  - Nada é apagado nem alterado na obra de origem; só se lê dela.
 *  - Idempotente: o client_pk é derivado do id da obra, então converter duas vezes aponta para o
 *    mesmo serviço em vez de duplicar.
 *  - Sem perda: devolve contagem de itens de origem e de destino por campo; `conferido` só é true
 *    quando as duas batem.
 */
import { SERVICO_PHOTO_MAP, type TipoServico } from '../types/servico';

type Dict = Record<string, any>;

const POSTE_TYPES: TipoServico[] = ['Book de Aterramento', 'Cava em Rocha', 'Fundação Especial', 'Linha Viva'];
const CHECKLIST_STRUCT_FIELDS = [
  'checklist_postes_data',
  'checklist_seccionamentos_data',
  'checklist_aterramentos_cerca_data',
  'checklist_hastes_termometros_data',
] as const;

export interface ConversaoCampo {
  campo: string;
  origem: number;
  destino: number;
}

export interface ResultadoConversao {
  /** Linha pronta para `servicos`; null se a obra não puder ser convertida. */
  servico: Dict | null;
  /** Por que não converteu (tipo desconhecido, sem id etc.). */
  motivo?: string;
  campos: ConversaoCampo[];
  totalOrigem: number;
  totalDestino: number;
  /** true quando nenhum item foi perdido na cópia. */
  conferido: boolean;
  /** true quando as fotos achatadas (antes/durante/depois) viraram um poste P1 por não haver postes_data. */
  postesAPartirDeFotosAchatadas: boolean;
}

const contar = (valor: unknown): number => {
  if (!Array.isArray(valor)) return 0;
  return valor.filter((item) => {
    if (!item) return false;
    if (typeof item === 'string') return item.length > 0;
    return !!(item.url || item.uri || item.id);
  }).length;
};

/** Conta fotos dentro de um array de postes/seccionamentos/etc. (qualquer array aninhado de fotos). */
const contarEstruturado = (valor: unknown): number => {
  if (!Array.isArray(valor)) return 0;
  let total = 0;
  for (const item of valor) {
    if (!item || typeof item !== 'object') continue;
    for (const v of Object.values(item as Dict)) {
      if (Array.isArray(v)) total += contar(v);
    }
  }
  return total;
};

const camposDeFotoDoTipo = (tipo: TipoServico, obra: Dict): string[] => {
  const doMapa = (SERVICO_PHOTO_MAP[tipo] || []).map((c) => String(c.field));
  if (tipo === 'Transformador') {
    return Object.keys(obra).filter((k) => k.startsWith('fotos_transformador_'));
  }
  if (tipo === 'Checklist de Fiscalização') {
    return Object.keys(obra).filter((k) => k.startsWith('fotos_checklist_'));
  }
  if (POSTE_TYPES.includes(tipo)) return []; // vive em postes_data
  return doMapa;
};

const modoTransformador = (obra: Dict, campos: string[]): 'instalado' | 'retirado' | 'ambos' | null => {
  const declarado = String(obra.transformador_status || '').toLowerCase().trim();
  if (declarado === 'instalado' || declarado === 'retirado' || declarado === 'ambos') return declarado;
  const temInstalado = campos.some((c) => c.endsWith('_instalado') && contar(obra[c]) > 0);
  const temRetirado = campos.some((c) => (c.endsWith('_retirado') || c.endsWith('_antes_retirar')) && contar(obra[c]) > 0);
  if (temInstalado && temRetirado) return 'ambos';
  if (temInstalado) return 'instalado';
  if (temRetirado) return 'retirado';
  return null;
};

export function obraLegadaParaServico(obra: Dict): ResultadoConversao {
  const vazio: ResultadoConversao = {
    servico: null, campos: [], totalOrigem: 0, totalDestino: 0, conferido: false, postesAPartirDeFotosAchatadas: false,
  };

  const tipo = String(obra?.tipo_servico || '').trim() as TipoServico;
  if (!tipo || !(tipo in SERVICO_PHOTO_MAP)) return { ...vazio, motivo: `tipo de serviço desconhecido: "${tipo}"` };

  const obraId = String(obra?.serverId || obra?.id || '').trim();
  if (!obraId) return { ...vazio, motivo: 'obra sem id' };

  const campos: ConversaoCampo[] = [];
  const servico: Dict = {
    // id fica por conta de quem grava; client_pk estável garante a idempotência.
    // Prefixo svc_ faz as telas tratarem como serviço do padrão novo (nunca hidratar de obra legada).
    client_pk: `svc_legado_${String(obra.id || obraId).replace(/[^a-zA-Z0-9_-]/g, '_')}_${String(tipo).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`,
    obra_id: obraId,
    obra_numero: obra.obra ?? null,
    equipe: obra.equipe ?? null,
    tipo_servico: tipo,
    responsavel: obra.responsavel ?? null,
    status: obra.data_fechamento || obra.finalizada_em || obra.status === 'finalizada' ? 'completo' : 'em_progresso',
    sync_status: 'offline',
    created_at: obra.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dados_adicionais: { convertido_de_obra_legada: true, obra_legada_id: obra.id ?? null },
  };

  // 1. Fotos em colunas planas
  const camposFoto = camposDeFotoDoTipo(tipo, obra);
  for (const campo of camposFoto) {
    const origem = contar(obra[campo]);
    servico[campo] = Array.isArray(obra[campo]) ? [...obra[campo]] : [];
    campos.push({ campo, origem, destino: contar(servico[campo]) });
  }

  // 2. Dados estruturados
  let postesAPartirDeFotosAchatadas = false;
  if (POSTE_TYPES.includes(tipo)) {
    let postes: any[] = Array.isArray(obra.postes_data) ? obra.postes_data.map((p: Dict) => ({ ...p })) : [];
    const origemEstruturada = contarEstruturado(postes);
    const achatadas = ['fotos_antes', 'fotos_durante', 'fotos_depois', 'fotos_medicao'].filter((c) => contar(obra[c]) > 0);
    if (postes.length === 0 && achatadas.length > 0) {
      // Sem postes_data: preserva as fotos num poste P1 (nunca descarta foto).
      postesAPartirDeFotosAchatadas = true;
      postes = [{
        id: `poste_legado_${obra.id || obraId}`,
        numero: 1,
        isAditivo: false,
        fotos_antes: [...(obra.fotos_antes || [])],
        fotos_durante: [...(obra.fotos_durante || [])],
        fotos_depois: [...(obra.fotos_depois || [])],
        fotos_medicao: [...(obra.fotos_medicao || [])],
      }];
      const origemAchatada = achatadas.reduce((s, c) => s + contar(obra[c]), 0);
      campos.push({ campo: 'postes_data (de fotos achatadas)', origem: origemAchatada, destino: contarEstruturado(postes) });
    } else {
      campos.push({ campo: 'postes_data', origem: origemEstruturada, destino: contarEstruturado(postes) });
    }
    servico.postes_data = postes.length > 0 ? postes : null;
  }

  if (tipo === 'Checklist de Fiscalização') {
    for (const campo of CHECKLIST_STRUCT_FIELDS) {
      const valor = obra[campo];
      servico[campo] = Array.isArray(valor) ? valor.map((x: Dict) => ({ ...x })) : null;
      campos.push({ campo, origem: contarEstruturado(valor), destino: contarEstruturado(servico[campo]) });
    }
  }

  if (tipo === 'Transformador') {
    const modo = modoTransformador(obra, camposFoto);
    if (modo) servico.dados_adicionais = { ...servico.dados_adicionais, transformador_modo: modo };
    if (obra.transformador_status) servico.transformador_status = obra.transformador_status;
  }

  const totalOrigem = campos.reduce((s, c) => s + c.origem, 0);
  const totalDestino = campos.reduce((s, c) => s + c.destino, 0);
  const conferido = campos.every((c) => c.origem === c.destino);

  return { servico, campos, totalOrigem, totalDestino, conferido, postesAPartirDeFotosAchatadas };
}
