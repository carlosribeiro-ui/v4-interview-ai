import { NextRequest, NextResponse } from 'next/server';
import { lerSessao, buscarUsuarioPorId, excluirUsuario, contarAdmins, verificarTokenVersion } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';
import { atualizarRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode alterar permissões' }, { status: 403 });
  }
  if (!(await verificarTokenVersion(sessao))) {
    return NextResponse.json({ error: 'Sessão expirada — faça login novamente' }, { status: 401 });
  }

  const alvo = await buscarUsuarioPorId(params.id);
  if (!alvo) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { role } = body ?? {};
  if (role !== 'admin' && role !== 'talent') {
    return NextResponse.json({ error: 'role deve ser "admin" ou "talent"' }, { status: 400 });
  }
  if (alvo.role === role) {
    return NextResponse.json({ ok: true, mensagem: 'Role já é esse valor' });
  }

  // Previne rebaixar o último admin
  if (alvo.role === 'admin' && role === 'talent' && (await contarAdmins()) <= 1) {
    return NextResponse.json({ error: 'Não é possível rebaixar o único admin restante' }, { status: 400 });
  }

  await atualizarRole(params.id, role);
  await registrarLog('role_alterada', { usuario: alvo.email, de: alvo.role, para: role }, sessao.email);
  return NextResponse.json({ ok: true, role });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode gerenciar usuários' }, { status: 403 });
  }
  // V-SEC: Verifica tokenVersion em operações destrutivas
  if (!(await verificarTokenVersion(sessao))) {
    return NextResponse.json({ error: 'Sessão expirada — faça login novamente' }, { status: 401 });
  }

  const alvo = await buscarUsuarioPorId(params.id);
  if (!alvo) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  if (alvo.id === sessao.sub) {
    return NextResponse.json({ error: 'Você não pode remover seu próprio usuário' }, { status: 400 });
  }
  if (alvo.role === 'admin' && (await contarAdmins()) <= 1) {
    return NextResponse.json({ error: 'Não é possível remover o último admin' }, { status: 400 });
  }

  await excluirUsuario(params.id);
  await registrarLog('usuario_removido', { usuarioRemovido: alvo.email }, sessao.email);
  return NextResponse.json({ ok: true });
}
