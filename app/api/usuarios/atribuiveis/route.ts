import { NextRequest, NextResponse } from 'next/server';
import { lerSessao, listarUsuarios } from '@/lib/auth';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * Lista mínima de usuários pra popular o dropdown "atribuir talent" no kanban
 * (/candidatos). Diferente de GET /api/usuarios (que é admin-only e devolve o
 * usuário completo pra tela de gestão), esta rota é liberada pra qualquer
 * sessão admin/talent — o kanban é usado pelos dois papéis — e devolve só
 * nome/email/role, sem tokenVersion nem o flag `ativo`.
 */
export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const bloqueado = await aplicarRateLimit(req, 'usuarios-atribuiveis', LIMITES.admin, sessao.email);
  if (bloqueado) return bloqueado;

  const usuarios = await listarUsuarios();
  const atribuiveis = usuarios
    .filter((u) => u.ativo !== false)
    .map((u) => ({ nome: u.nome, email: u.email, role: u.role }));

  return NextResponse.json(atribuiveis);
}
