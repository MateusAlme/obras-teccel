import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, useWindowDimensions } from 'react-native';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { carregarResumoInicio, tempoRelativo, type ResumoInicio, type ObraResumoInicio } from '../../lib/resumo-inicio';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import NetInfo from '@react-native-community/netinfo';
import {
  checkInternetConnection,
  getPendingObras,
  syncAllPendingObras,
  startAutoSync,
} from '../../lib/offline-sync';
import type { PendingObra } from '../../lib/offline-sync';
import {
  getAllowedServiceTypesForProfile,
  isCompressorProfile,
  isObraVisibleForProfile,
  isAdminOrSupervisor,
} from '../../lib/profile-rules';

export default function Dashboard() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const [equipeLogada, setEquipeLogada] = useState('');
  const [userRole, setUserRole] = useState('');
  const [totalObras, setTotalObras] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pendingObras, setPendingObras] = useState<PendingObra[]>([]);
  const [pendingObrasUnicas, setPendingObrasUnicas] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [syncingPending, setSyncingPending] = useState(false);
  const [resumo, setResumo] = useState<ResumoInicio | null>(null);
  const isCompressor = getAllowedServiceTypesForProfile(userRole, equipeLogada)?.[0] === 'Cava em Rocha';
  const isAdmin = isAdminOrSupervisor(userRole);
  const isSmallScreen = width < 380;
  const horizontalPadding = width < 360 ? 14 : width < 430 ? 18 : 22;

  useEffect(() => {
    initializeDashboard();
  }, []);

  useEffect(() => {
    let isMounted = true;

    checkInternetConnection().then(online => {
      if (isMounted) {
        setIsOnline(online);
      }
    });

    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected === true && state.isInternetReachable === true;
      setIsOnline(online);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!equipeLogada && !isAdmin) return;

    const unsubscribe = startAutoSync(async result => {
      if (result.success > 0 || result.failed > 0) {
        await loadPendingObras(equipeLogada, userRole);
        await carregarEstatisticas(equipeLogada, userRole);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [equipeLogada, userRole, isAdmin]);

  const initializeDashboard = async () => {
    try {
      const equipe = await AsyncStorage.getItem('@equipe_logada');
      const role = await AsyncStorage.getItem('@user_role');
      const equipeAtual = equipe || '';
      const roleAtual = role || '';
      setEquipeLogada(equipeAtual);
      setUserRole(roleAtual);

      if (!equipeAtual && !isAdminOrSupervisor(roleAtual)) {
        setTotalObras(0);
        setPendingObras([]);
        return;
      }

      await Promise.all([
        carregarEstatisticas(equipeAtual, roleAtual),
        loadPendingObras(equipeAtual, roleAtual),
      ]);
    } catch (error) {
      console.error('Erro ao inicializar dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarEstatisticas = async (equipeParam?: string, roleParam?: string) => {
    try {
      const equipe = equipeParam || equipeLogada;
      const role = roleParam || userRole;
      if (!equipe && !isAdminOrSupervisor(role)) {
        setTotalObras(0);
        return;
      }

      // Buscar apenas o campo 'obra' para contar obras únicas (agrupadas por número)
      let query = supabase.from('obras').select('obra');

      if (!isAdminOrSupervisor(role)) {
        query = query.eq('equipe', equipe);
      }

      if (isCompressorProfile(role, equipe)) {
        query = query.or('tipo_servico.eq.Cava em Rocha,creator_role.eq.compressor');
      } else {
        const allowed = getAllowedServiceTypesForProfile(role, equipe);
        if (allowed?.length === 1) {
          query = query.eq('tipo_servico', allowed[0]);
        }
      }

      const { data, error } = await query;

      if (!error && data) {
        // Contar números de obra únicos (mesmo critério do agrupamento em obras.tsx)
        const obrasUnicas = new Set(data.map((o) => String(o.obra || '').trim().toLowerCase()));
        setTotalObras(obrasUnicas.size);
      }
    } catch (err) {
      console.error('Erro ao carregar estatisticas:', err);
    }
  };

  const loadPendingObras = async (equipeParam?: string, roleParam?: string) => {
    try {
      const equipe = equipeParam || equipeLogada;
      const role = roleParam || userRole;
      if (!equipe && !isAdminOrSupervisor(role)) {
        setPendingObras([]);
        return;
      }

      const obras = await getPendingObras();
      const obrasSincronizaveis = obras.filter((obra) => {
        const status = obra.sync_status ?? 'pending';
        return status === 'pending' || status === 'failed';
      });
      const pendentesDaEquipe = obrasSincronizaveis.filter((obra) => {
        if (!isAdminOrSupervisor(role)) {
          const mesmaEquipe = obra.equipe === equipe;
          if (!mesmaEquipe) return false;
        }
        return isObraVisibleForProfile(obra as any, role, equipe);
      });
      setPendingObras(pendentesDaEquipe);
      // Contar obras únicas pendentes pelo número da obra
      const unicas = new Set(pendentesDaEquipe.map((o) => String((o as any).obra || o.id).trim().toLowerCase()));
      setPendingObrasUnicas(unicas.size);
    } catch (error) {
      console.error('Erro ao carregar pendencias:', error);
    }
  };

  const handleSyncPendingObras = async () => {
    if (pendingObras.length === 0) return;

    setSyncingPending(true);
    try {
      const result = await syncAllPendingObras();
      await loadPendingObras();
      await carregarEstatisticas();

      if (result.success === 0 && result.failed === 0) {
        Alert.alert('Sem conexao', 'Precisamos de internet para enviar as obras.');
        return;
      }

      if (result.failed > 0) {
        Alert.alert('Atencao', `${result.failed} item(ns) ainda estao na fila. Tente novamente.`);
      } else {
        Alert.alert('Pronto', `${result.success} item(ns) sincronizados.`);
      }
    } catch (error) {
      console.error('Erro ao sincronizar pendencias:', error);
      Alert.alert('Erro', 'Nao foi possivel sincronizar agora. Tente novamente.');
    } finally {
      setSyncingPending(false);
    }
  };

  // Sair remove só a sessão. Obras, rascunhos e fotos pendentes ficam no aparelho e continuam
  // sendo enviados (o antigo AsyncStorage.clear() apagava tudo, inclusive o que ainda não subiu).
  const handleLogout = () => {
    const sair = async () => {
      try {
        await AsyncStorage.multiRemove([
          '@equipe_logada', '@user_logado', '@user_role', '@equipe_id',
          '@session_token', '@session_expires_at', '@login_timestamp', '@cached_credentials',
        ]);
        router.replace('/login' as any);
      } catch (error) {
        console.error('Erro ao sair:', error);
        Alert.alert('Erro', 'Não foi possível sair. Tente novamente.');
      }
    };
    const aviso = pendingObrasUnicas > 0
      ? `Há ${pendingObrasUnicas} obra(s) aguardando envio. Elas ficam salvas no aparelho e serão enviadas quando você entrar de novo com conexão.`
      : 'Tem certeza que deseja sair?';
    if (Platform.OS === 'web') {
      if (confirm(aviso)) void sair();
      return;
    }
    Alert.alert('Sair da conta', aviso, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: sair },
    ]);
  };

  // "Sair" na barra superior, com texto, para ficar claro o que é.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleLogout}
          accessibilityLabel="Sair da conta"
          style={styles.headerLogout}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="log-out-outline" size={22} color={theme.colors.primary} />
          <Text style={styles.headerLogoutText}>Sair</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, pendingObrasUnicas]);

  const saudacao = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  })();
  const nomeEquipe = equipeLogada ? equipeLogada : isAdmin ? 'Administrador' : 'Equipe';
  const mostrarAvisoSync = !isOnline || pendingObrasUnicas > 0;
  const abrirObra = (numero: string) =>
    router.push({ pathname: '/obra-books', params: { obraNumero: numero } });

  // Recarrega o resumo ao voltar para a aba (depois de salvar, enviar ou sincronizar).
  useFocusEffect(
    useCallback(() => {
      if (!equipeLogada && !isAdmin) return;
      let ativo = true;
      carregarResumoInicio(equipeLogada, userRole)
        .then((r) => { if (ativo) setResumo(r); })
        .catch((e) => console.warn('Resumo do início falhou:', e));
      return () => { ativo = false; };
    }, [equipeLogada, userRole, isAdmin, pendingObrasUnicas])
  );

  const linhaObra = (o: ObraResumoInicio, comEstado: boolean) => (
    <TouchableOpacity
      key={o.numero}
      style={styles.listRow}
      activeOpacity={0.7}
      onPress={() => abrirObra(o.numero)}
    >
      <View style={styles.listRowTexts}>
        <Text style={styles.listRowTitle} numberOfLines={1}>Obra {o.numero}</Text>
        <Text style={styles.listRowSub} numberOfLines={1}>
          {o.tipos.length > 1 ? `${o.tipos.length} serviços` : (o.tipos[0] || 'Serviço')}
          {` · ${o.fotos} ${o.fotos === 1 ? 'foto' : 'fotos'}`}
        </Text>
      </View>
      {comEstado && (
        <View style={[styles.chip, o.estado === 'concluida' && styles.chipDone]}>
          <Text style={[styles.chipText, o.estado === 'concluida' && styles.chipTextDone]}>
            {o.estado === 'concluida' ? 'Concluída' : 'Em andamento'}
          </Text>
        </View>
      )}
      {o.aguardandoEnvio && (
        <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.textSubtle} style={{ marginLeft: 8 }} />
      )}
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSubtle} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );

  const pendingMessage = isOnline
    ? pendingObrasUnicas > 0
      ? isCompressor
        ? `${pendingObrasUnicas} obra(s) de Cava em Rocha aguardando sincronizacao`
        : isAdmin
        ? `${pendingObrasUnicas} obra(s) aguardando sincronizacao`
        : `${pendingObrasUnicas} obra(s) da equipe aguardando sincronizacao`
      : isCompressor
      ? 'Todos os books de Cava em Rocha estao sincronizados'
      : isAdmin
      ? 'Todas as obras estao sincronizadas'
      : 'Tudo sincronizado para a sua equipe'
    : 'Cadastros ficam locais e sincronizam quando voltar a conexao';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.content, { paddingHorizontal: horizontalPadding }]}>

        {/* Cabeçalho: saudação à esquerda, estado da conexão discreto à direita */}
        <View style={styles.header}>
          <View style={styles.headerTexts}>
            {/* Atalho de suporte: segurar 1,5 s abre o diagnóstico, fora da vista da equipe. */}
            <TouchableOpacity activeOpacity={1} onLongPress={() => router.push('/diagnostico')} delayLongPress={1500}>
              <Text style={styles.greeting}>{saudacao}</Text>
            </TouchableOpacity>
            <Text style={styles.teamName} numberOfLines={1}>{nomeEquipe}</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.connection} accessibilityLabel={isOnline ? 'Conectado' : 'Sem conexão'}>
              <Ionicons
                name={isOnline ? 'wifi' : 'cloud-offline-outline'}
                size={20}
                color={isOnline ? theme.colors.textMuted : theme.colors.textStrong}
              />
              {!isOnline && <Text style={styles.connectionText}>Offline</Text>}
            </View>
          </View>
        </View>

        {/* Ação principal */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/nova-obra-rapida')}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={26} color={theme.colors.textOnPrimary} />
          <View style={styles.primaryTexts}>
            <Text style={styles.primaryButtonText}>Iniciar nova obra</Text>
            <Text style={styles.primaryButtonHint}>Fotos e dados ficam salvos no aparelho</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textOnPrimary} />
        </TouchableOpacity>

        {/* Números */}
        <View style={[styles.metricsRow, isSmallScreen && styles.metricsRowStacked]}>
          <TouchableOpacity
            style={styles.metricCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/obras')}
          >
            <View style={styles.metricHead}>
              <Ionicons name="construct-outline" size={18} color={theme.colors.textMuted} />
              <Text style={styles.metricLabel}>{isAdmin ? 'Obras' : 'Obras da equipe'}</Text>
            </View>
            <Text style={styles.metricValue}>{loading ? '...' : totalObras}</Text>
          </TouchableOpacity>
          <View style={styles.metricCard}>
            <View style={styles.metricHead}>
              <Ionicons
                name={pendingObrasUnicas > 0 ? 'cloud-upload-outline' : 'checkmark-circle-outline'}
                size={18}
                color={pendingObrasUnicas > 0 ? theme.colors.primary : theme.colors.textMuted}
              />
              <Text style={styles.metricLabel}>Aguardando envio</Text>
            </View>
            <Text style={[styles.metricValue, pendingObrasUnicas > 0 && { color: theme.colors.primary }]}>
              {loading ? '...' : pendingObrasUnicas}
            </Text>
          </View>
        </View>

        {/* Aviso de sincronização: só aparece offline ou com pendência, em tom neutro */}
        {mostrarAvisoSync && (
          <View style={styles.syncNotice}>
            <Ionicons
              name={isOnline ? 'sync-outline' : 'cloud-offline-outline'}
              size={20}
              color={theme.colors.textStrong}
            />
            <View style={styles.syncTexts}>
              <Text style={styles.syncTitle}>{isOnline ? 'Aguardando sincronização' : 'Sem conexão'}</Text>
              <Text style={styles.syncSubtitle}>{pendingMessage}</Text>
            </View>
            {isOnline && pendingObrasUnicas > 0 && (
              <TouchableOpacity
                style={[styles.syncButton, syncingPending && styles.syncButtonDisabled]}
                onPress={handleSyncPendingObras}
                disabled={syncingPending}
              >
                {syncingPending ? (
                  <ActivityIndicator size="small" color={theme.colors.textOnPrimary} />
                ) : (
                  <Text style={styles.syncButtonText}>Enviar</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Continuar de onde parou */}
        {resumo && resumo.continuar.length > 0 && (
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Continuar de onde parou</Text>
            {resumo.continuar.map((o, i) => (
              <View key={o.numero} style={i > 0 ? styles.listRowDivider : undefined}>{linhaObra(o, false)}</View>
            ))}
          </View>
        )}

        {/* Estado da sincronização */}
        {resumo && (
          <View style={styles.syncLine}>
            <Ionicons name="sync-outline" size={14} color={theme.colors.textSubtle} />
            <Text style={styles.syncLineText}>
              Última sincronização {tempoRelativo(resumo.ultimaSincronizacao)}
              {resumo.fotosNaFila > 0 ? `  ·  ${resumo.fotosNaFila} ${resumo.fotosNaFila === 1 ? 'foto' : 'fotos'} na fila` : ''}
            </Text>
          </View>
        )}

      </View>
    </ScrollView>
  );
}

const { colors, radius, cardShadow } = theme;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 110, flexGrow: 1 },
  content: { paddingTop: 20, flexGrow: 1 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  headerTexts: { flex: 1, paddingRight: 12 },
  greeting: { fontSize: 13, color: colors.textMuted },
  teamName: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerLogout: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 16, paddingVertical: 6 },
  headerLogoutText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  connectionText: { fontSize: 12, fontWeight: '600', color: colors.textStrong },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 16,
    paddingHorizontal: 16,
    ...cardShadow,
  },
  primaryTexts: { flex: 1 },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: colors.textOnPrimary },
  primaryButtonHint: { fontSize: 12, color: colors.primarySoft, marginTop: 2 },

  metricsRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  metricsRowStacked: { flexDirection: 'column' },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 14,
    ...cardShadow,
  },
  metricHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricLabel: { fontSize: 12, fontWeight: '600', color: colors.textBody },
  metricValue: { fontSize: 30, fontWeight: '700', color: colors.text, marginTop: 8 },

  syncNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 14,
  },
  syncTexts: { flex: 1 },
  syncTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  syncSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  syncButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 64,
    alignItems: 'center',
  },
  syncButtonDisabled: { backgroundColor: colors.primaryDisabled },
  syncButtonText: { fontSize: 13, fontWeight: '700', color: colors.textOnPrimary },

  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingTop: 12,
    marginTop: 14,
    flexGrow: 1,
    ...cardShadow,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textStrong,
    marginBottom: 4,
  },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listLink: { fontSize: 13, fontWeight: '600', color: colors.primary },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  listRowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  chip: {},
  chipDone: {},
  chipText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  chipTextDone: { color: colors.textBody },
  syncLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  syncLineText: { fontSize: 12, color: colors.textSubtle },
  listRowTexts: { flex: 1, paddingRight: 8 },
  listRowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  listRowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
