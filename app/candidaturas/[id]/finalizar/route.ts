import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, getVaga, finalizarCandidaturaAtomica } from '@/lib/store';
import { lerSessao, extrairCandidaturaId, listarUsuarios } from '@/lib/auth';
import { comFila } from '@/lib/queue';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Auth: admin/talent OU candidato dono
  const sessao = await lerSessao(req);
  const candidatoId = await extrairCandidaturaId(req);
  if ((!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) && candidatoId !== params.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  return comFila(`candidatura:${params.id}`, async () => {
    const candidatura = await getCandidatura(params.id);
    if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

    if (candidatura.status === 'concluida') {
      return NextResponse.json(candidatura);
    }

    if (candidatura.respostas.length === 0) {
      return NextResponse.json({ error: 'Nenhuma resposta registrada ainda' }, { status: 400 });
    }

    const avaliadas = candidatura.respostas.filter((r) => !r.avaliando);
    const scoreMedio = avaliadas.length
      ? Math.round((avaliadas.reduce((sum, r) => sum + r.score, 0) / avaliadas.length) * 10) / 10
      : null;

    const atualizada = await finalizarCandidaturaAtomica(params.id, candidatura.version, scoreMedio);
    if (!atualizada) {
      const atual = await getCandidatura(params.id);
      if (atual?.status === 'concluida') {
        return NextResponse.json(atual);
      }
      return NextResponse.json({ error: 'Concorrência detectada — recarregue e tente novamente.' }, { status: 409 });
    }

    // Avisa o talent responsável (se houver) que a entrevista está pronta pra revisão —
    // só dispara e-mail de verdade se houver um template ativo pro evento em /admin/config.
    if (atualizada.talentResponsavel) {
      const [vaga, usuarios] = await Promise.all([getVaga(atualizada.vagaId), listarUsuarios()]);
      const talent = usuarios.find((u) => u.email === atualizada.talentResponsavel);
      const origem = req.headers.get('origin') || req.nextUrl.origin;
      registrarLog('candidatura_finalizada', {
        candidaturaId: atualizada.id,
        candidatoNome: atualizada.nome,
        candidatoEmail: atualizada.email,
        vagaCargo: vaga?.cargo ?? '—',
        vagaId: atualizada.vagaId,
        talentEmail: atualizada.talentResponsavel,
        talentNome: talent?.nome ?? '',
        linkRevisao: `${origem}/vagas/${atualizada.vagaId}`
      }).catch(() => {});
    }

    return NextResponse.json(atualizada);
  });
}
