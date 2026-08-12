import { randomUUID } from 'crypto';
import { getDb } from './mongodb';
import { enviarEmail, renderizarTemplate } from './email';

/**
 * Templates de e-mail configuráveis via UI de admin (aba "Modelos de e-mail" em
 * /admin/config), no mesmo espírito dos webhooks (aba "Webhooks"): admin cadastra,
 * sem precisar de redeploy. Cada evento tem as variáveis disponíveis documentadas
 * no `detalhes` passado pra registrarLog() no ponto de disparo (ver CAMPO_DESTINATARIO).
 */
export type EmailEvento = 'candidatura_finalizada' | 'parecer_gerado';

export const EVENTOS_EMAIL_VALIDOS: EmailEvento[] = ['candidatura_finalizada', 'parecer_gerado'];

/** Campo dentro de `detalhes` que contém o e-mail do destinatário, por evento. */
const CAMPO_DESTINATARIO: Record<EmailEvento, string> = {
  candidatura_finalizada: 'talentEmail',
  parecer_gerado: 'candidatoEmail'
};

export type EmailTemplate = {
  id: string;
  evento: EmailEvento;
  assunto: string;
  corpoHtml: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

export type EmailEnviado = {
  id: string;
  templateId?: string;
  evento: string;
  destinatario: string;
  assunto: string;
  corpoRenderizado: string;
  status: 'enviado' | 'falha' | 'nao_configurado';
  erro?: string;
  enviadoEm: string;
};

async function templatesCollection() {
  const db = await getDb();
  return db.collection<EmailTemplate>('emailTemplates');
}

async function enviadosCollection() {
  const db = await getDb();
  return db.collection<EmailEnviado>('emailsEnviados');
}

export async function listarTemplates(): Promise<EmailTemplate[]> {
  const col = await templatesCollection();
  return col.find({}).sort({ criadoEm: 1 }).toArray();
}

export async function buscarTemplate(id: string): Promise<EmailTemplate | null> {
  const col = await templatesCollection();
  return col.findOne({ id });
}

/** Só os templates ativos que escutam um evento específico — usado no dispatch. */
async function templatesParaEvento(evento: string): Promise<EmailTemplate[]> {
  const col = await templatesCollection();
  return col.find({ ativo: true, evento: evento as EmailEvento }).toArray();
}

export async function criarTemplate(dados: { evento: EmailEvento; assunto: string; corpoHtml: string }): Promise<EmailTemplate> {
  const col = await templatesCollection();
  const agora = new Date().toISOString();
  const template: EmailTemplate = {
    id: randomUUID(),
    evento: dados.evento,
    assunto: dados.assunto.trim(),
    corpoHtml: dados.corpoHtml,
    ativo: true,
    criadoEm: agora,
    atualizadoEm: agora
  };
  await col.insertOne(template);
  return template;
}

export async function atualizarTemplate(
  id: string,
  dados: Partial<{ assunto: string; corpoHtml: string; ativo: boolean }>
): Promise<void> {
  const col = await templatesCollection();
  const set: Record<string, unknown> = { atualizadoEm: new Date().toISOString() };
  if (dados.assunto !== undefined) set.assunto = dados.assunto.trim();
  if (dados.corpoHtml !== undefined) set.corpoHtml = dados.corpoHtml;
  if (dados.ativo !== undefined) set.ativo = dados.ativo;
  await col.updateOne({ id }, { $set: set });
}

export async function removerTemplate(id: string): Promise<void> {
  const col = await templatesCollection();
  await col.deleteOne({ id });
}

export async function listarEnviados(filtro: { evento?: string; status?: string; limite?: number } = {}): Promise<EmailEnviado[]> {
  const col = await enviadosCollection();
  const query: Record<string, unknown> = {};
  if (filtro.evento) query.evento = filtro.evento;
  if (filtro.status) query.status = filtro.status;
  return col
    .find(query)
    .sort({ enviadoEm: -1 })
    .limit(Math.min(filtro.limite ?? 200, 1000))
    .toArray();
}

/**
 * Dispara os templates configurados pra um evento — chamado por registrarLog()
 * (lib/logs.ts), fire-and-forget, nunca lança nem bloqueia quem chamou registrarLog.
 * Silenciosamente não faz nada se o evento não é um EmailEvento válido, se não há
 * template ativo pra ele, ou se `detalhes` não trouxe o campo de destinatário esperado.
 */
export async function dispararEmailConfiguravel(evento: string, detalhes: Record<string, unknown>): Promise<void> {
  if (!EVENTOS_EMAIL_VALIDOS.includes(evento as EmailEvento)) return;

  const templates = await templatesParaEvento(evento);
  if (templates.length === 0) return;

  const campoDestinatario = CAMPO_DESTINATARIO[evento as EmailEvento];
  const destinatario = detalhes[campoDestinatario];
  if (typeof destinatario !== 'string' || !destinatario) return;

  const enviadosCol = await enviadosCollection();

  await Promise.allSettled(
    templates.map(async (template) => {
      const assunto = renderizarTemplate(template.assunto, detalhes);
      const corpoRenderizado = renderizarTemplate(template.corpoHtml, detalhes);
      const resultado = await enviarEmail(destinatario, assunto, corpoRenderizado);

      const registro: EmailEnviado = {
        id: randomUUID(),
        templateId: template.id,
        evento,
        destinatario,
        assunto,
        corpoRenderizado,
        status: resultado.ok ? 'enviado' : resultado.motivo === 'not_configured' ? 'nao_configurado' : 'falha',
        erro: resultado.ok ? undefined : resultado.motivo,
        enviadoEm: new Date().toISOString()
      };
      await enviadosCol.insertOne(registro).catch((err) => console.error('[email-templates] Falha ao registrar outbox:', err));
    })
  );
}
