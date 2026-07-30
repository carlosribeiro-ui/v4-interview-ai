import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { listarUsuarios, criarUsuario } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode gerenciar usuários' }, { status: 403 });
  }
  return NextResponse.json(await listarUsuarios());
}

export async function POST(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode gerenciar usuários' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { nome, email, role, senha } = body ?? {};
  if (!nome || !email || !senha || (role !== 'admin' && role !== 'talent')) {
    return NextResponse.json({ error: 'nome, email, senha e role (admin|talent) são obrigatórios' }, { status: 400 });
  }
  if (senha.length < 8) {
    return NextResponse.json({ error: 'Senha deve ter ao menos 8 caracteres' }, { status: 400 });
  }

  try {
    const usuario = await criarUsuario({ nome, email, role, senha });
    await registrarLog('usuario_criado', { novoUsuario: usuario.email, role: usuario.role }, sessao.email);
    return NextResponse.json(usuario, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao criar usuário' }, { status: 409 });
  }
}
