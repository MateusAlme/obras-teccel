/**
 * Script para corrigir campo 'origem' e 'status' de obras já salvas no AsyncStorage
 *
 * USAR APENAS UMA VEZ para migrar obras antigas
 */

import { supabase } from './supabase';
import type { LocalObra } from './offline-sync';
import * as obraStore from './obra-store';

/**
 * Corrige obra comparando com dados do Supabase E remove duplicatas
 */
export const fixObraOrigemStatus = async (): Promise<{
  total: number;
  corrigidas: number;
  erros: number;
  duplicatasRemovidas: number;
}> => {
  try {
    console.log('🔧 Iniciando correção de obras...');

    // 1. Buscar todas as obras locais
    const localObras: LocalObra[] = await obraStore.getAllObras();
    if (!localObras.length) {
      console.log('⚠️ Nenhuma obra local encontrada');
      return { total: 0, corrigidas: 0, erros: 0, duplicatasRemovidas: 0 };
    }

    console.log(`📊 Total de obras locais (antes): ${localObras.length}`);

    // 2. PRIMEIRO: Remover duplicatas (manter apenas a mais recente de cada número)
    console.log('\n🧹 PASSO 1: Removendo duplicatas...');
    const obrasPorNumero = new Map<string, LocalObra[]>();

    // Agrupar obras por número
    for (const obra of localObras) {
      const numero = obra.obra;
      if (!obrasPorNumero.has(numero)) {
        obrasPorNumero.set(numero, []);
      }
      obrasPorNumero.get(numero)!.push(obra);
    }

    // Para cada grupo, manter apenas a mais recente
    const obrasUnicas: LocalObra[] = [];
    let duplicatasRemovidas = 0;

    for (const [numero, obras] of obrasPorNumero.entries()) {
      if (obras.length > 1) {
        console.log(`  🔍 Obra ${numero}: ${obras.length} cópias encontradas`);

        // Ordenar por data de modificação (mais recente primeiro)
        const ordenadas = obras.sort((a, b) => {
          const dateA = new Date(a.last_modified || a.created_at || a.data || 0).getTime();
          const dateB = new Date(b.last_modified || b.created_at || b.data || 0).getTime();
          return dateB - dateA;
        });

        // Manter apenas a primeira (mais recente)
        obrasUnicas.push(ordenadas[0]);
        duplicatasRemovidas += obras.length - 1;
        console.log(`    ✅ Mantendo versão de ${ordenadas[0].created_at || ordenadas[0].data}`);
        console.log(`    ❌ Removendo ${obras.length - 1} duplicata(s)`);
      } else {
        // Não é duplicata
        obrasUnicas.push(obras[0]);
      }
    }

    console.log(`\n📊 Duplicatas removidas: ${duplicatasRemovidas}`);
    console.log(`📊 Obras únicas restantes: ${obrasUnicas.length}`);

    // 3. SEGUNDO: Corrigir status das obras únicas E remover obras deletadas
    console.log('\n🔧 PASSO 2: Corrigindo status e removendo obras deletadas...');
    let corrigidas = 0;
    let erros = 0;
    let removidas = 0;
    const obrasFinais: LocalObra[] = [];

    for (let i = 0; i < obrasUnicas.length; i++) {
      const obra = obrasUnicas[i];
      console.log(`\n🔍 Verificando obra ${i + 1}/${obrasUnicas.length}: ${obra.obra}`);

      try {
        // Sempre buscar no Supabase para garantir status correto
        console.log(`  🔍 Buscando obra ${obra.obra} no Supabase...`);

        let supabaseObra = null;

        // Tentar buscar por ID primeiro (se não for temp_)
        if (obra.id && !obra.id.startsWith('temp_')) {
          const { data, error } = await supabase
            .from('obras')
            .select('*')
            .eq('id', obra.id)
            .single();

          if (!error && data) {
            supabaseObra = data;
            console.log(`  ✅ Encontrada por ID: ${obra.id}`);
          }
        }

        // Se não encontrou por ID, tentar por número + equipe
        if (!supabaseObra) {
          const { data, error } = await supabase
            .from('obras')
            .select('*')
            .eq('obra', obra.obra)
            .eq('equipe', obra.equipe)
            .single();

          if (!error && data) {
            supabaseObra = data;
            console.log(`  ✅ Encontrada por número: ${obra.obra}`);
          } else {
            console.log(`  ⚠️ Obra ${obra.obra} não encontrada no Supabase`);
          }
        }

        // Aplicar correções OU remover se não existe mais
        if (supabaseObra) {
          // Obra existe no Supabase - corrigir e manter
          let modificada = false;
          console.log(`  📝 Corrigindo obra ${obra.obra}:`);

          if (!obra.origem || obra.origem !== 'online') {
            obra.origem = 'online';
            console.log(`    - origem: ${obra.origem || 'undefined'} → 'online'`);
            modificada = true;
          }

          if (!obra.status || obra.status !== supabaseObra.status) {
            const statusAntes = obra.status || 'undefined';
            obra.status = supabaseObra.status;
            console.log(`    - status: ${statusAntes} → '${supabaseObra.status}'`);
            modificada = true;
          }

          if (!obra.synced) {
            obra.synced = true;
            console.log(`    - synced: false → true`);
            modificada = true;
          }

          if (obra.locallyModified) {
            obra.locallyModified = false;
            console.log(`    - locallyModified: true → false`);
            modificada = true;
          }

          // Atualizar ID se for temp_ ou local_
          if ((obra.id.startsWith('temp_') || obra.id.startsWith('local_')) && supabaseObra.id) {
            console.log(`    - ID: ${obra.id} → ${supabaseObra.id}`);
            obra.id = supabaseObra.id;
            obra.serverId = supabaseObra.id;
            modificada = true;
          }

          // Atualizar finalizada_em se existir
          if (supabaseObra.finalizada_em && obra.finalizada_em !== supabaseObra.finalizada_em) {
            obra.finalizada_em = supabaseObra.finalizada_em;
            console.log(`    - finalizada_em: ${obra.finalizada_em || 'undefined'} → '${supabaseObra.finalizada_em}'`);
            modificada = true;
          }

          if (modificada) {
            corrigidas++;
            console.log(`  ✅ Obra ${obra.obra} corrigida!`);
          } else {
            console.log(`  ℹ️ Obra ${obra.obra} não precisou de correção`);
          }

          // Adicionar à lista final
          obrasFinais.push(obra);

        } else {
          // Obra NÃO existe no Supabase
          // Se tiver synced=true, foi deletada do servidor - REMOVER
          if (obra.synced === true || obra.origem === 'online') {
            console.log(`  🗑️ REMOVENDO: Obra ${obra.obra} foi deletada do Supabase`);
            console.log(`    - ID: ${obra.id}`);
            console.log(`    - Synced: ${obra.synced}`);
            console.log(`    - Origem: ${obra.origem}`);
            removidas++;
            // NÃO adicionar à lista final (será removida)
          } else {
            // Obra offline que nunca foi sincronizada - manter
            console.log(`  📝 Mantendo obra offline: ${obra.obra}`);
            obra.origem = 'offline';
            obra.status = obra.status || 'em_aberto';
            obrasFinais.push(obra);
          }
        }

      } catch (error) {
        console.error(`  ❌ Erro ao corrigir obra ${obra.obra}:`, error);
        erros++;
        // Mesmo com erro, manter a obra (segurança)
        obrasFinais.push(obra);
      }
    }

    // 4. Salvar obras finais (únicas, corrigidas, sem deletadas)
    await obraStore.replaceAllObras(obrasFinais);
    console.log(`\n💾 Obras salvas no armazenamento local`);

    console.log('\n📊 RESUMO FINAL:');
    console.log(`  - Total inicial: ${localObras.length}`);
    console.log(`  - Duplicatas removidas: ${duplicatasRemovidas}`);
    console.log(`  - Obras deletadas removidas: ${removidas}`);
    console.log(`  - Obras mantidas: ${obrasFinais.length}`);
    console.log(`  - Status corrigidos: ${corrigidas}`);
    console.log(`  - Erros: ${erros}`);

    return {
      total: localObras.length,
      corrigidas,
      erros,
      duplicatasRemovidas: duplicatasRemovidas + removidas // Total de obras removidas
    };

  } catch (error) {
    console.error('❌ Erro fatal ao corrigir obras:', error);
    throw error;
  }
};

/**
 * Verifica status de uma obra específica
 */
export const debugObra = async (obraNumero: string): Promise<void> => {
  try {
    console.log(`\n🔍 Debug da obra ${obraNumero}:`);

    // Buscar no armazenamento local
    const localObras: LocalObra[] = await obraStore.getAllObras();
    if (!localObras.length) {
      console.log('❌ Nenhuma obra local encontrada');
      return;
    }

    const obraLocal = localObras.find(o => o.obra === obraNumero);

    if (!obraLocal) {
      console.log(`❌ Obra ${obraNumero} não encontrada no AsyncStorage`);
      return;
    }

    console.log('\n📱 AsyncStorage:');
    console.log(`  - ID: ${obraLocal.id}`);
    console.log(`  - Origem: ${obraLocal.origem || 'undefined'}`);
    console.log(`  - Status: ${obraLocal.status || 'undefined'}`);
    console.log(`  - Synced: ${obraLocal.synced}`);
    console.log(`  - LocallyModified: ${obraLocal.locallyModified}`);
    console.log(`  - ServerID: ${obraLocal.serverId || 'undefined'}`);
    console.log(`  - Finalizada em: ${obraLocal.finalizada_em || 'undefined'}`);

    // Buscar no Supabase
    const { data: supabaseObra, error } = await supabase
      .from('obras')
      .select('*')
      .eq('obra', obraNumero)
      .single();

    if (error || !supabaseObra) {
      console.log('\n⚠️ Supabase: Obra não encontrada');
    } else {
      console.log('\n☁️ Supabase:');
      console.log(`  - ID: ${supabaseObra.id}`);
      console.log(`  - Status: ${supabaseObra.status || 'undefined'}`);
      console.log(`  - Finalizada em: ${supabaseObra.finalizada_em || 'undefined'}`);
      console.log(`  - Equipe: ${supabaseObra.equipe}`);
    }

  } catch (error) {
    console.error('❌ Erro ao debugar obra:', error);
  }
};
