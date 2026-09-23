import { NextRequest, NextResponse } from 'next/server'
import { updateAdminUser, changeAdminUserPassword, deleteAdminUser } from '@/lib/supabase-admin'
<<<<<<< HEAD
=======
import { requireAdmin } from '@/lib/api-auth'
>>>>>>> 4d8d81ab1139b72c3df1b9bf1140f108dd880ef6

// PUT: Atualizar usuário admin
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
<<<<<<< HEAD
=======
  const auth = await requireAdmin(request)
  if (auth.error) return auth.error

>>>>>>> 4d8d81ab1139b72c3df1b9bf1140f108dd880ef6
  try {
    const body = await request.json()
    const { full_name, role, password } = body
    const { id: userId } = await params

    // Atualizar dados do usuário
    if (full_name !== undefined || role !== undefined) {
      await updateAdminUser(userId, { full_name, role })
    }

    // Atualizar senha se fornecida
    if (password && password.length >= 6) {
      await changeAdminUserPassword(userId, password)
    }

    return NextResponse.json({
      success: true,
      message: 'Usuário atualizado com sucesso'
    })
  } catch (error: any) {
    console.error('Erro ao atualizar usuário:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao atualizar usuário' },
      { status: 500 }
    )
  }
}

// DELETE: Excluir usuário admin
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
<<<<<<< HEAD
=======
  const auth = await requireAdmin(request)
  if (auth.error) return auth.error

>>>>>>> 4d8d81ab1139b72c3df1b9bf1140f108dd880ef6
  try {
    const { id: userId } = await params
    await deleteAdminUser(userId)

    return NextResponse.json({
      success: true,
      message: 'Usuário excluído com sucesso'
    })
  } catch (error: any) {
    console.error('Erro ao excluir usuário:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Erro ao excluir usuário' },
      { status: 500 }
    )
  }
}
