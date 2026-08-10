import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, getVaga, salvarParecerAtomico } from '@/lib/store';
import { gerarParecer } from '@/lib/llm';
import { gerarParecerPdfBuffer } from '@/lib/parecer-pdf';
import { comFila } from '@/lib/queue';
import type { Parecer } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Gera o parecer com fila — evita que requests paralelas gerem pareceres duplicados. */
async function obterOuGerarParecer(candidaturaId: string) {
  return comFila(`candidatura:${candidaturaId}`, async () => {
    const candidatura = await getCandidatura(candidaturaId);
    if (!candidatura) return { erro: 'Candidatura não encontrada', status: 404 } as const;

    const vaga = await getVaga(candidatura.vagaId);
    if (!vaga) return { erro: 'Vaga não encontrada', status: 404 } as const;

    if (candidatura.respostas.length === 0) {
      return { erro: 'Candidato ainda não respondeu nenhuma pergunta', status: 400 } as const;
    }

    if (candidatura.respostas.some((r) => r.avaliando)) {
      return {
        erro: 'Ainda há resposta(s) sendo avaliadas em background — aguarde terminar antes de gerar o parecer.',
        status: 409
      } as const;
    }

    if (!candidatura.parecer) {
      const curriculoTexto = [candidatura.linkedin, candidatura.curriculoPath].filter(Boolean).join('\n');
      const gerado = await gerarParecer(
        {
          cargo: vaga.cargo,
          senioridade: vaga.senioridade,
          segmento: vaga.segmento,
          requisitos: vaga.requisitos,
          jobDescription: vaga.jobDescription
        },
        candidatura.respostas.map((r) => ({
          perguntaId: r.perguntaId,
          texto: vaga.perguntas.find((p) => p.id === r.perguntaId)?.texto ?? '',
          transcricao: r.transcricao,
          score: r.score,
          feedback: r.feedback
        })),
        curriculoTexto || undefined
      );

      const parecer: Parecer = {
        ...gerado,
        scoreGeral: candidatura.scoreMedio ?? 0,
        geradoEm: new Date().toISOString()
      };

      const atualizada = await salvarParecerAtomico(candidaturaId, candidatura.version, parecer);
      if (atualizada) {
        return { candidatura: atualizada, vaga } as const;
      }
      const recarregada = await getCandidatura(candidaturaId);
      if (recarregada) return { candidatura: recarregada, vaga } as const;
    }

    return { candidatura, vaga } as const;
  });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const formato = req.nextUrl.searchParams.get('formato');

  try {
    const resultado = await obterOuGerarParecer(params.id);
    if ('erro' in resultado) {
      return NextResponse.json({ error: resultado.erro }, { status: resultado.status });
    }
    const { candidatura, vaga } = resultado;

    if (formato === 'pdf') {
      const buffer = await gerarParecerPdfBuffer(vaga, candidatura);
      const nomeArquivo = `parecer-${candidatura.nome.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${nomeArquivo}"`
        }
      });
    }

    return NextResponse.json({ parecer: candidatura.parecer });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao gerar parecer' }, { status: 500 });
  }
}
