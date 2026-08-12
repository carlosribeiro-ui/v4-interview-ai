import { NextRequest, NextResponse } from 'next/server';
import {
  lerSessao, buscarUsuarioPorId, excluirUsuario, contarAdmins, verificarTokenVersion,
  atualizarRole, atualizarAtivo, atualizarDadosAdmin, resetarSenhaAdmin
} from '@/lib/auth';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

/**
 * Admin edita um usuário: role, ativo/inativo, nome/e-mail e/ou reset de senha.
 * Cada campo é opcional e independente — o body pode trazer um ou vários de uma vez.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode alterar usuários' }, { status: 403 });
  }
  if (!(await verificarTokenVersion(sessao))) {
    return NextResponse.json({ error: 'Sessão expirada — faça login novamente' }, { status: 401 });
  }

  const alvo = await buscarUsuarioPorId(params.id);
  if (!alvo) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { role, ativo, nome, email, senha } = body ?? {};

  // V-SEC: valida tipos antes de usar em qualquer lugar
  if (role !== undefined && role !== 'admin' && role !== 'talent') {
    return NextResponse.json({ error: 'role deve ser "admin" ou "talent"' }, { status: 400 });
  }
  if (ativo !== undefined && typeof ativo !== 'boolean') {
    return NextResponse.json({ error: 'ativo deve ser booleano' }, { status: 400 });
  }
  if (nome !== undefined && (typeof nome !== 'string' || !nome.trim())) {
    return NextResponse.json({ error: 'nome deve ser texto não-vazio' }, { status: 400 });
  }
  if (email !== undefined && (typeof email !== 'string' || !email.includes('@'))) {
    return NextResponse.json({ error: 'email inválido' }, { status: 400 });
  }
  if (senha !== undefined && (typeof senha !== 'string' || senha.length < 8)) {
    return NextResponse.json({ error: 'senha deve ter ao menos 8 caracteres' }, { status: 400 });
  }

  // Previne rebaixar/desativar o último admin
  if (role === 'talent' && alvo.role === 'admin' && (await contarAdmins()) <= 1) {
    return NextResponse.json({ error: 'Não é possível rebaixar o único admin restante' }, { status: 400 });
  }
  if (ativo === false && alvo.role === 'admin' && (await contarAdmins()) <= 1) {
    return NextResponse.json({ error: 'Não é possível desativar o único admin restante' }, { status: 400 });
  }
  if (ativo === false && alvo.id === sessao.sub) {
    return NextResponse.json({ error: 'Você não pode desativar seu próprio usuário' }, { status: 400 });
  }

  try {
    if (role !== undefined && role !== alvo.role) {
      await atualizarRole(params.id, role);
      await registrarLog('role_alterada', { usuario: alvo.email, de: alvo.role, para: role }, sessao.email);
    }
    if (ativo !== undefined) {
      await atualizarAtivo(params.id, ativo);
      await registrarLog(ativo ? 'usuario_ativado' : 'usuario_desativado', { usuario: alvo.email }, sessao.email);
    }
    if (nome !== undefined || email !== undefined) {
      await atualizarDadosAdmin(params.id, { nome, email });
      await registrarLog('usuario_editado', { usuario: alvo.email, nome, email }, sessao.email);
    }
    if (senha !== undefined) {
      await resetarSenhaAdmin(params.id, senha);
      await registrarLog('senha_resetada', { usuario: alvo.email }, sessao.email);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao atualizar usuário' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
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
