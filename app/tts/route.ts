import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { sintetizarFala } from '@/lib/tts';
import { uploadParaR2 } from '@/lib/r2';
import { getVaga, saveVaga } from '@/lib/store';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';
import { lerSessao, extrairCandidaturaId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function hashTexto(texto: string): string {
  return createHash('sha256').update(texto.trim()).digest('hex');
}

/**
 * Converte texto em áudio (voz natural via Gemini TTS) — usado pelo botão "Ouvir pergunta" da entrevista.
 *
 * Cache por conteúdo (2026-08-13): com `vagaId`+`perguntaId`, só regenera se o hash do
 * texto atual não bater com o hash salvo junto do audioUrl anterior — cobre o bug original
 * (áudio ficando obsoleto quando admin editava a pergunta) sem pagar uma chamada Gemini
 * nova a cada "Ouvir pergunta" de cada candidato pra pergunta que não mudou. Isso importa
 * de verdade aqui: o modelo TTS do Gemini tem tier de só 10 RPM / 100 RPD — sem cache,
 * qualquer pico de gente ouvindo pergunta ao mesmo tempo estoura a cota do dia inteiro.
 * Sem esses IDs (compat), sempre gera e nunca cacheia.
 *
 * V-SEC: Auth check — TTS tem custo por chamada. Requer sessão OU candidato token.
 */
export async function POST(req: NextRequest) {
  // Auth: sessão (admin/talent) OU candidato token (scoped a uma candidatura)
  const sessao = await lerSessao(req);
  const candidatoId = await extrairCandidaturaId(req);
  if ((!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) && !candidatoId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // V-SEC: escopo por candidato/sessão, não por IP — ver nota em .../respostas/route.ts
  const bloqueado = await aplicarRateLimit(req, 'tts', LIMITES.tts, sessao?.email || candidatoId || undefined);
  if (bloqueado) return bloqueado;

  const body = await req.json().catch(() => ({}));
  const texto = typeof body?.texto === 'string' ? body.texto.trim() : '';
  const vagaId = typeof body?.vagaId === 'string' ? body.vagaId : undefined;
  const perguntaId = typeof body?.perguntaId === 'string' ? body.perguntaId : undefined;
  if (!texto) return NextResponse.json({ error: 'texto é obrigatório' }, { status: 400 });

  try {
    const hashAtual = hashTexto(texto);

    if (vagaId && perguntaId) {
      const vaga = await getVaga(vagaId);
      const pergunta = vaga?.perguntas.find((p) => p.id === perguntaId);
      if (vaga && pergunta) {
        // Cache hit: texto não mudou desde a última geração — devolve o áudio já
        // no R2 sem gastar nenhuma chamada Gemini.
        if (pergunta.audioUrl && pergunta.audioTextoHash === hashAtual) {
          return NextResponse.json({ audioUrl: pergunta.audioUrl });
        }

        const wav = await sintetizarFala(texto);
        const url = await uploadParaR2(`tts/${vagaId}/${perguntaId}.wav`, wav, 'audio/wav');
        pergunta.audioUrl = url;
        pergunta.audioTextoHash = hashAtual;
        // Nota: saveVaga aqui é aceitável porque audioUrl é idempotente (último write vence)
        // e a operação é de baixa concorrência (só dispara em cache miss, i.e. 1ª audição
        // dessa pergunta ou depois que o texto mudou).
        await saveVaga(vaga);
        return NextResponse.json({ audioUrl: url });
      }
    }

    // Sem vagaId/perguntaId (compat) — não tem onde cachear, sempre gera.
    const wav = await sintetizarFala(texto);
    return new NextResponse(new Uint8Array(wav), {
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao gerar áudio' }, { status: 500 });
  }
}
