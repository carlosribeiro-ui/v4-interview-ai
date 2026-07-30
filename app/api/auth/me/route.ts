import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao) return NextResponse.json({ usuario: null }, { status: 401 });
  return NextResponse.json({ usuario: { id: sessao.sub, nome: sessao.nome, email: sessao.email, role: sessao.role } });
}
