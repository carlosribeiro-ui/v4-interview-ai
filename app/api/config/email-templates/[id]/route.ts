import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { buscarTemplate, atualizarTemplate, removerTemplate } from '@/lib/email-templates';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode editar modelos de e-mail' }, { status: 403 });
  }

  const alvo = await buscarTemplate(params.id);
  if (!alvo) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { assunto, corpoHtml, ativo } = body ?? {};

  if (assunto !== undefined && (typeof assunto !== 'string' || !assunto.trim())) {
    return NextResponse.json({ error: 'assunto deve ser texto não-vazio' }, { status: 400 });
  }
  if (corpoHtml !== undefined && (typeof corpoHtml !== 'string' || !corpoHtml.trim())) {
    return NextResponse.json({ error: 'corpoHtml deve ser texto não-vazio' }, { status: 400 });
  }
  if (ativo !== undefined && typeof ativo !== 'boolean') {
    return NextResponse.json({ error: 'ativo deve ser booleano' }, { status: 400 });
  }

  await atualizarTemplate(params.id, { assunto, corpoHtml, ativo });
  await registrarLog('email_template_alterado', { acao: 'editado', evento: alvo.evento }, sessao.email);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode remover modelos de e-mail' }, { status: 403 });
  }

  const alvo = await buscarTemplate(params.id);
  if (!alvo) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });

  await removerTemplate(params.id);
  await registrarLog('email_template_alterado', { acao: 'removido', evento: alvo.evento }, sessao.email);
  return NextResponse.json({ ok: true });
}
