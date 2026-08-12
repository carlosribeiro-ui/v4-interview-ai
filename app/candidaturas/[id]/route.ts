import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, getVaga, deleteCandidatura, patchCandidaturaAtomica } from '@/lib/store';
import { lerSessao, extrairCandidaturaId, verificarTokenVersion } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';
import { deletarPrefixoR2 } from '@/lib/r2';
import { comFila } from '@/lib/queue';

export const dynamic = 'force-dynamic';

/**
 * Auth check: session (admin/talent) OU candidate token (scoped à candidatura).
 * Retorna null se autorizado, ou NextResponse 401/403 se não.
 */
async function checarAuth(req: NextRequest, candidaturaId: string): Promise<NextResponse | null> {
  // 1. Tenta session de admin/talent
  const sessao = await lerSessao(req);
  if (sessao && (sessao.role === 'admin' || sessao.role === 'talent')) {
    return null; // Autorizado
  }

  // 2. Tenta token de candidato (só pra sua própria candidatura)
  const candidatoId = await extrairCandidaturaId(req);
  if (candidatoId === candidaturaId) {
    return null; // Candidato acessando sua própria candidatura
  }

  return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
}

/**
 * Verifica se o request é de um candidato (não admin/talent).
 * Candidatos têm permissões restritas de escrita.
 */
async function isCandidatoRequest(req: NextRequest, candidaturaId: string): Promise<boolean> {
  const sessao = await lerSessao(req);
  if (sessao && (sessao.role === 'admin' || sessao.role === 'talent')) {
    return false;
  }
  const candidatoId = await extrairCandidaturaId(req);
  return candidatoId === candidaturaId;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authErro = await checarAuth(_req, params.id);
  if (authErro) return authErro;

  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const vaga = await getVaga(candidatura.vagaId);
  return NextResponse.json({ candidatura, vaga });
}

/**
 * PATCH com fila — precisa de auth (admin/talent OU candidato dono).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return comFila(`candidatura:${params.id}`, async () => {
    const authErro = await checarAuth(req, params.id);
    if (authErro) return authErro;

    // V-SEC: Verifica tokenVersion para admin/talent — previne uso de sessão revogada
    const sessao = await lerSessao(req);
    if (sessao && (sessao.role === 'admin' || sessao.role === 'talent')) {
      if (!(await verificarTokenVersion(sessao))) {
        return NextResponse.json({ error: 'Sessão expirada — faça login novamente' }, { status: 401 });
      }
    }

    const candidatura = await getCandidatura(params.id);
    if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    // V-SEC: Candidato só pode editar campos próprios (nome, linkedin, telefone, pretensão).
    // Campos admin-only (talentResponsavel, segmento, nível, formação, localização, idioma)
    // são bloqueados quando o request vem de candidato.
    const candidatoOnly = await isCandidatoRequest(req, params.id);

    const campos: Record<string, unknown> = {};
    if (typeof body.nome === 'string' && body.nome.trim()) campos.nome = body.nome.trim();
    if (typeof body.linkedin === 'string') campos.linkedin = body.linkedin;
    if (typeof body.telefone === 'string') campos.telefone = body.telefone;
    if (typeof body.pretensaoSalarial === 'string') campos.pretensaoSalarial = body.pretensaoSalarial;

    // Campos restritos a admin/talent
    if (!candidatoOnly) {
      if (typeof body.curriculoPath === 'string') campos.curriculoPath = body.curriculoPath;
      if (typeof body.talentResponsavel === 'string') campos.talentResponsavel = body.talentResponsavel || undefined;
      if (typeof body.segmento === 'string') campos.segmento = body.segmento || undefined;
      if (typeof body.nivelProfissional === 'string') campos.nivelProfissional = body.nivelProfissional || undefined;
      if (typeof body.formacao === 'string') campos.formacao = body.formacao || undefined;
      if (typeof body.pais === 'string') campos.pais = body.pais || undefined;
      if (typeof body.estado === 'string') campos.estado = body.estado || undefined;
      if (typeof body.cidade === 'string') campos.cidade = body.cidade || undefined;
      if (typeof body.idioma === 'string') campos.idioma = body.idioma || undefined;
    }

    if (Object.keys(campos).length === 0) {
      return NextResponse.json(candidatura);
    }

    const atualizada = await patchCandidaturaAtomica(params.id, candidatura.version, campos);
    if (!atualizada) {
      return NextResponse.json({ error: 'Concorrência detectada — recarregue e tente novamente.' }, { status: 409 });
    }
    return NextResponse.json(atualizada);
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode remover a candidatura' }, { status: 403 });
  }
  // V-SEC: Verifica tokenVersion em operações destrutivas
  if (!(await verificarTokenVersion(sessao))) {
    return NextResponse.json({ error: 'Sessão expirada — faça login novamente' }, { status: 401 });
  }

  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  await deleteCandidatura(params.id);
  await deletarPrefixoR2(`${params.id}/`);
  await registrarLog(
    'candidatura_removida',
    { candidaturaId: params.id, vagaId: candidatura.vagaId, email: candidatura.email },
    sessao.email
  );
  return NextResponse.json({ ok: true });
}
