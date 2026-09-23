import { supabase } from '@/lib/supabase'

/**
 * fetch() que anexa o Authorization: Bearer <access_token> da sessão atual.
 * Necessário para as rotas de API que exigem admin (ver requireAdmin em api-auth.ts).
 */
export async function authFetch(input: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return fetch(input, { ...init, headers })
}
