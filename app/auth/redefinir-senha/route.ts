import { NextRequest, NextResponse } from 'next/server';
import { redefinirSenhaComToken } from '@/lib/auth';
import { registrarLogSeguranca } from '@/lib/logs';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const bloqueado = await aplicarRateLimit(req, 'redefinir-senha', LIMITES.resetSenha);
  if (bloqueado) return bloqueado;

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token : '';
  const novaSenha = typeof body.novaSenha === 'string' ? body.novaSenha : '';

  if (!token || !novaSenha) {
    return NextResponse.json({ error: 'Token e nova senha são obrigatórios' }, { status: 400 });
  }
  if (novaSenha.length < 8) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 8 caracteres' }, { status: 400 });
  }

  const resultado = await redefinirSenhaComToken(token, novaSenha);
  if (!resultado.ok) {
    await registrarLogSeguranca('senha_reset_solicitado', req, { sucesso: false, erro: resultado.erro });
    return NextResponse.json({ error: resultado.erro }, { status: 400 });
  }

  await registrarLogSeguranca('senha_resetada', req, { via: 'esqueci-senha' });
  return NextResponse.json({ ok: true });
}
