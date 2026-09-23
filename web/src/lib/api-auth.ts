import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Valida o Bearer token da requisição e exige role 'admin' no profile.
 * Uso: const auth = await requireAdmin(request); if (auth.error) return auth.error
 */
export async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return {
      error: NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 }),
    }
  }

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !user) {
    return {
      error: NextResponse.json({ success: false, error: 'Sessão inválida ou expirada' }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return {
      error: NextResponse.json({ success: false, error: 'Acesso restrito a administradores' }, { status: 403 }),
    }
  }

  return { user }
}
