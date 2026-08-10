import { NextRequest, NextResponse } from 'next/server';
import { autenticar, criarTokenSessao, garantirUsuariosSeed, NOME_COOKIE_SESSAO } from '@/lib/auth';
import { registrarLog, registrarLogSeguranca } from '@/lib/logs';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Rate limit por IP (brute force de rede)
    const bloqueado = await aplicarRateLimit(req, 'login', LIMITES.login);
    if (bloqueado) {
      await registrarLogSeguranca('rate_limit_hit', req, { endpoint: 'login' });
      return bloqueado;
    }

    await garantirUsuariosSeed();

    const { email, senha } = await req.json();
    if (!email || !senha) {
      return NextResponse.json({ error: 'E-mail e senha são obrigatórios' }, { status: 400 });
    }

    // Rate limit por email (brute force de conta — previne ataque distribuído)
    const emailKey = `email:${email.trim().toLowerCase()}:login`;
    const emailRate = await rateLimit(emailKey, 10, 900_000); // 10 tentativas por 15 min
    if (!emailRate.allowed) {
      await registrarLogSeguranca('rate_limit_hit', req, { endpoint: 'login', email: email.trim().toLowerCase() });
      return NextResponse.json(
        { error: 'Muitas tentativas para este e-mail. Tente novamente em 15 minutos.' },
        { status: 429 }
      );
    }

    const usuario = await autenticar(email, senha);
    if (!usuario) {
      await registrarLogSeguranca('login_falhou', req, { email: email.trim().toLowerCase() }, email);
      return NextResponse.json({ error: 'E-mail ou senha inválidos' }, { status: 401 });
    }

    await registrarLogSeguranca('login', req, { role: usuario.role }, usuario.email);

    const { token, maxAgeSeg } = await criarTokenSessao({
      ...usuario,
      tokenVersion: usuario.tokenVersion ?? 0
    });
    const res = NextResponse.json({ nome: usuario.nome, role: usuario.role });
    res.cookies.set(NOME_COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: maxAgeSeg,
      path: '/'
    });
    return res;
  } catch (err: any) {
    console.error('[Login] Erro não tratado:', err);
    return NextResponse.json(
      { error: 'Erro interno no login' },
      { status: 500 }
    );
  }
}
