import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { listarTemplates, criarTemplate, EVENTOS_EMAIL_VALIDOS, type EmailEvento } from '@/lib/email-templates';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode ver os modelos de e-mail' }, { status: 403 });
  }
  return NextResponse.json(await listarTemplates());
}

export async function POST(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode criar modelos de e-mail' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { evento, assunto, corpoHtml } = body ?? {};

  if (typeof evento !== 'string' || !EVENTOS_EMAIL_VALIDOS.includes(evento as EmailEvento)) {
    return NextResponse.json({ error: 'evento inválido' }, { status: 400 });
  }
  if (typeof assunto !== 'string' || !assunto.trim()) {
    return NextResponse.json({ error: 'assunto é obrigatório' }, { status: 400 });
  }
  if (typeof corpoHtml !== 'string' || !corpoHtml.trim()) {
    return NextResponse.json({ error: 'corpoHtml é obrigatório' }, { status: 400 });
  }

  const template = await criarTemplate({ evento: evento as EmailEvento, assunto, corpoHtml });
  await registrarLog('email_template_alterado', { acao: 'criado', evento, assunto: template.assunto }, sessao.email);
  return NextResponse.json(template, { status: 201 });
}
