import type { Candidatura, Vaga } from './types';
import { registrarLog } from './logs';

/**
 * Dispara o webhook configurado na fase (Vaga.fases[].webhookUrl), se houver.
 * Fire-and-forget com timeout curto — nunca deve bloquear nem falhar a troca de fase em si.
 */
export async function dispararWebhookFase(vaga: Vaga, candidatura: Candidatura, faseId: string): Promise<void> {
  const fase = vaga.fases.find((f) => f.id === faseId);
  const url = fase?.webhookUrl;
  if (!url) return;

  const payload = {
    evento: 'candidatura.fase_alterada',
    vagaId: vaga.id,
    vagaExternalId: vaga.externalId ?? null,
    cargo: vaga.cargo,
    candidaturaId: candidatura.id,
    nome: candidatura.nome,
    email: candidatura.email,
    fase: { id: fase.id, nome: fase.nome },
    scoreMedio: candidatura.scoreMedio,
    ocorridoEm: new Date().toISOString()
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    await registrarLog('webhook_disparado', { vagaId: vaga.id, faseId: fase.id, url, status: res.status });
  } catch (err: any) {
    console.error(`Webhook da fase "${fase.nome}" (vaga ${vaga.id}) falhou:`, err);
    await registrarLog('webhook_falhou', { vagaId: vaga.id, faseId: fase.id, url, erro: err?.message ?? String(err) });
  }
}
