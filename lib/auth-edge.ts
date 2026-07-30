import type { NextRequest } from 'next/server';

/**
 * Parte de sessão que roda no middleware (Edge runtime) — por isso usa SOMENTE
 * Web Crypto (crypto.subtle) e nenhum módulo Node (fs/path/crypto), que o Edge
 * runtime não suporta. Hash de senha e leitura de data/usuarios.json ficam em
 * lib/auth.ts (Node), importado apenas pelas Route Handlers (Node runtime).
 */

export type Role = 'admin' | 'talent';
export type SessaoPayload = { sub: string; nome: string; email: string; role: Role; exp: number };

export const NOME_COOKIE_SESSAO = 'v4_session';
const SESSAO_DIAS = 7;

function segredo(): string {
  return process.env.SESSION_SECRET || 'dev-secret-troque-em-producao-v4-interview-ai';
}

function base64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function chaveHmac(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function assinar(payload: SessaoPayload): Promise<string> {
  const corpo = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const chave = await chaveHmac();
  const assinaturaBuf = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo));
  const assinatura = base64urlEncode(new Uint8Array(assinaturaBuf));
  return `${corpo}.${assinatura}`;
}

async function verificarToken(token: string): Promise<SessaoPayload | null> {
  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return null;
  try {
    const chave = await chaveHmac();
    const valido = await crypto.subtle.verify(
      'HMAC',
      chave,
      base64urlDecode(assinatura) as BufferSource,
      new TextEncoder().encode(corpo)
    );
    if (!valido) return null;
    const payload: SessaoPayload = JSON.parse(new TextDecoder().decode(base64urlDecode(corpo)));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function criarTokenSessao(usuario: {
  id: string;
  nome: string;
  email: string;
  role: Role;
}): Promise<{ token: string; maxAgeSeg: number }> {
  const maxAgeSeg = SESSAO_DIAS * 24 * 60 * 60;
  const payload: SessaoPayload = {
    sub: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    role: usuario.role,
    exp: Date.now() + maxAgeSeg * 1000
  };
  return { token: await assinar(payload), maxAgeSeg };
}

export async function lerSessao(req: NextRequest): Promise<SessaoPayload | null> {
  const token = req.cookies.get(NOME_COOKIE_SESSAO)?.value;
  if (!token) return null;
  return verificarToken(token);
}
