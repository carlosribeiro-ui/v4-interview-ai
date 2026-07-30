import { NextRequest, NextResponse } from 'next/server';
import { autenticar, criarTokenSessao, garantirUsuariosSeed, NOME_COOKIE_SESSAO } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  await garantirUsuariosSeed();

  const { email, senha } = await req.json();
  if (!email || !senha) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios' }, { status: 400 });
  }

  const usuario = await autenticar(email, senha);
  if (!usuario) {
    return NextResponse.json({ error: 'E-mail ou senha inválidos' }, { status: 401 });
  }

  const { token, maxAgeSeg } = await criarTokenSessao(usuario);
  const res = NextResponse.json({ nome: usuario.nome, role: usuario.role });
  res.cookies.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeSeg,
    path: '/'
  });
  return res;
}
