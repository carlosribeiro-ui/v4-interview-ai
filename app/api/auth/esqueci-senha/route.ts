import { NextRequest, NextResponse } from 'next/server';
import { gerarTokenReset } from '@/lib/auth';
import { registrarLogSeguranca } from '@/lib/logs';
import { enviarEmail, templateResetSenha } from '@/lib/email';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const bloqueado = await aplicarRateLimit(req, 'esqueci-senha', LIMITES.resetSenha);
  if (bloqueado) return bloqueado;

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim() : '';

  // V-SEC: resposta SEMPRE genérica, exista o e-mail ou não — do contrário
  // esse endpoint vira um oráculo pra descobrir quais e-mails têm conta aqui.
  const RESPOSTA_GENERICA = NextResponse.json({
    ok: true,
    mensagem: 'Se esse e-mail tiver uma conta, enviamos um link de redefinição.'
  });

  if (!email) return RESPOSTA_GENERICA;

  const resultado = await gerarTokenReset(email);
  await registrarLogSeguranca('senha_reset_solicitado', req, { email }); // loga a tentativa mesmo se o e-mail não existir (detecção de abuso)

  if (!resultado) return RESPOSTA_GENERICA; // e-mail não existe ou está inativo — mesma resposta, silenciosamente não envia nada

  const origem = req.headers.get('origin') || req.nextUrl.origin;
  const link = `${origem}/redefinir-senha?token=${resultado.token}`;

  const envio = await enviarEmail(email, 'Redefinir senha — V4 Interview AI', templateResetSenha(resultado.nome, link));

  // SMTP não configurado: não deixa o admin sem saída — loga o link nos logs
  // de auditoria (aba Configurações → só admin vê) pra repassar manualmente.
  if (!envio.ok && envio.motivo === 'not_configured') {
    console.warn('[esqueci-senha] SMTP não configurado — link:', link);
    await registrarLogSeguranca('senha_reset_solicitado', req, { email, smtpConfigurado: false, link });
  }

  return RESPOSTA_GENERICA;
}
