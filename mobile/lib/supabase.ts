import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// EXPO_PUBLIC_SUPABASE_* (mobile/.env.local) permite apontar o app pro Supabase
// LOCAL de testes (scripts/local-db-reset.sh) sem tocar em produção. Sem essas
// vars, ou em qualquer build que não seja de desenvolvimento, cai no endereço de produção abaixo.
// Só o app de DESENVOLVIMENTO (__DEV__) aceita apontar para o Supabase local. Em build de produção o app usa
// SEMPRE o endereço de produção, mesmo que o .env.local tenha subido junto para o build (já aconteceu: o EAS
// carregou o .env.local e o app ia apontar para 127.0.0.1).
const usarSupabaseLocal = __DEV__ && !!process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseUrl = usarSupabaseLocal ? (process.env.EXPO_PUBLIC_SUPABASE_URL as string) : 'https://hiuagpzaelcocyxutgdt.supabase.co';
const supabaseAnonKey = usarSupabaseLocal && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpdWFncHphZWxjb2N5eHV0Z2R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDE1ODAsImV4cCI6MjA3NzMxNzU4MH0.sEp1yx9p_RGPWUIQ1bzE2aYx1YdPiKHFZJ-GnG4a-N8';

// Função para obter equipe logada
const getEquipeLogada = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem('@equipe_logada');
  } catch {
    return null;
  }
};

// Função para obter role do usuário
const getUserRole = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem('@user_role');
  } catch {
    return null;
  }
};

// Token de sessao emitido pelo backend no login online
const getSessionToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem('@session_token');
  } catch {
    return null;
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: async (input, init?: RequestInit) => {
      const equipe = await getEquipeLogada();
      const role = await getUserRole();
      const sessionToken = await getSessionToken();

      const headers = new Headers(init?.headers ?? {});
      if (equipe) headers.set('x-equipe', equipe);
      if (role) headers.set('x-role', role);
      if (sessionToken) headers.set('x-session-token', sessionToken);

      return fetch(input, {
        ...(init ?? {}),
        headers,
      });
    },
  },
});
