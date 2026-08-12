import nodemailer from 'nodemailer';

/**
 * Envio de e-mail via SMTP genérico — pensado pra usar o Google Workspace
 * que a V4 já tem, com uma "senha de app" (myaccount.google.com/apppasswords),
 * sem precisar criar conta em nenhum provedor novo.
 *
 * Env vars:
 *   SMTP_HOST  (ex: smtp.gmail.com)
 *   SMTP_PORT  (ex: 465)
 *   SMTP_USER  (ex: algum@v4company.com)
 *   SMTP_PASS  (senha de app do Google — NÃO a senha normal da conta)
 *   SMTP_FROM  (opcional — remetente exibido; default = SMTP_USER)
 *
 * Se as env vars não estiverem configuradas, `enviarEmail` retorna
 * { ok: false, motivo: 'not_configured' } sem lançar erro — quem chama decide
 * o que fazer (ex: logar o link em vez de enviar, em dev).
 */

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 465,
    secure: Number(SMTP_PORT) !== 587, // 465 = TLS implícito, 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

export async function enviarEmail(
  destinatario: string,
  assunto: string,
  html: string
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, motivo: 'not_configured' };

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: destinatario,
      subject: assunto,
      html
    });
    return { ok: true };
  } catch (err) {
    console.error('[email] Falha ao enviar:', err);
    return { ok: false, motivo: 'send_failed' };
  }
}

/** Substitui `{{chave}}` pelo valor correspondente em `variaveis` (string vazia se ausente). Usado pelos templates configuráveis em /admin/config → Modelos de e-mail. */
export function renderizarTemplate(corpo: string, variaveis: Record<string, unknown>): string {
  return corpo.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, chave: string) => {
    const v = variaveis[chave];
    return v === undefined || v === null ? '' : String(v);
  });
}

export function templateResetSenha(nome: string, link: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="color: #80050B;">Redefinir senha — V4 Interview AI</h2>
      <p>Olá, ${nome.split(' ')[0]}.</p>
      <p>Recebemos um pedido pra redefinir sua senha. Clique no botão abaixo — o link expira em 30 minutos.</p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background: #80050B; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Redefinir senha
        </a>
      </p>
      <p style="color: #666; font-size: 13px;">Se não foi você quem pediu, ignore este e-mail — sua senha continua a mesma.</p>
      <p style="color: #999; font-size: 12px;">Link não funciona? Copie e cole: ${link}</p>
    </div>
  `;
}
