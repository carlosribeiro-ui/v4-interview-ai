import { NextResponse } from 'next/server';
import { NOME_COOKIE_SESSAO } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(NOME_COOKIE_SESSAO, '', { maxAge: 0, path: '/' });
  return res;
}
