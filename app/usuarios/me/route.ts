import { NextRequest, NextResponse } from 'next/server';
import { lerSessao, verificarTokenVersion, atualizarPerfilProprio, alterarSenhaPropria, criarTokenSessao, NOME_COOKIE_SESSAO } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

/**
 * Self-service: qualquer usuário logado (admin OU talent) edita o próprio
 * nome/e-mail e/ou troca a própria senha. Diferente da rota admin-only
 * /usuarios/[id], aqui não dá pra mudar role/ativo de ninguém —
 * só os dados de si mesmo, e senha exige a senha atual.
 */
export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  return NextResponse.json({ id: sessao.sub, nome: sessao.nome, email: sessao.email, role: sessao.role });
}

export async function PATCH(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (!(await verificarTokenVersion(sessao))) {
    return NextResponse.json({ error: 'Sessão expirada — faça login novamente' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { nome, email, senhaAtual, novaSenha } = body ?? {};

  if (nome !== undefined && (typeof nome !== 'string' || !nome.trim())) {
    return NextResponse.json({ error: 'nome deve ser texto não-vazio' }, { status: 400 });
  }
  if (email !== undefined && (typeof email !== 'string' || !email.includes('@'))) {
    return NextResponse.json({ error: 'email inválido' }, { status: 400 });
  }
  if (novaSenha !== undefined) {
    if (typeof senhaAtual !== 'string' || !senhaAtual) {
      return NextResponse.json({ error: 'Informe a senha atual pra trocar a senha' }, { status: 400 });
    }
    if (typeof novaSenha !== 'string' || novaSenha.length < 8) {
      return NextResponse.json({ error: 'Nova senha deve ter ao menos 8 caracteres' }, { status: 400 });
    }
  }

  let tokenVersionAtual = sessao.tv ?? 0;

  try {
    if (nome !== undefined || email !== undefined) {
      await atualizarPerfilProprio(sessao.sub, { nome, email });
      await registrarLog('usuario_editado', { usuario: sessao.email, autoedicao: true }, sessao.email);
    }

    if (novaSenha !== undefined) {
      const resultado = await alterarSenhaPropria(sessao.sub, senhaAtual, novaSenha);
      if (!resultado.ok) {
        return NextResponse.json({ error: resultado.erro }, { status: 400 });
      }
      tokenVersionAtual = resultado.usuario.tokenVersion ?? tokenVersionAtual + 1;
      await registrarLog('senha_alterada', { usuario: sessao.email, autoedicao: true }, sessao.email);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao atualizar perfil' }, { status: 409 });
  }

  // Reemite o cookie com os dados/tokenVersion atualizados — senão a própria troca
  // de senha (ou de e-mail, que também está no payload) derruba a sessão atual.
  const nomeAtual = nome ?? sessao.nome;
  const emailAtual = (email ?? sessao.email).trim().toLowerCase();
  const { token, maxAgeSeg } = await criarTokenSessao({
    id: sessao.sub,
    nome: nomeAtual,
    email: emailAtual,
    role: sessao.role,
    tokenVersion: tokenVersionAtual
  });

  const res = NextResponse.json({ ok: true, usuario: { id: sessao.sub, nome: nomeAtual, email: emailAtual, role: sessao.role } });
  res.cookies.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeSeg,
    path: '/'
  });
  return res;
}
