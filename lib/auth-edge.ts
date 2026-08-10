import type { NextRequest } from 'next/server';

/**
 * Parte de sessão que roda no middleware (Edge runtime) — por isso usa SOMENTE
 * Web Crypto (crypto.subtle) e nenhum módulo Node (fs/path/crypto), que o Edge
 * runtime não suporta. Hash de senha e leitura de data/usuarios.json ficam em
 * lib/auth.ts (Node), importado apenas pelas Route Handlers (Node runtime).
 */

export type Role = 'admin' | 'talent';
export type SessaoPayload = { sub: string; nome: string; email: string; role: Role; exp: number; tv?: number };

export const NOME_COOKIE_SESSAO = 'v4_session';
const SESSAO_DIAS = 7;

function segredo(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET não configurado. Adicione uma chave secreta no .env.local e no Vercel.');
  return s;
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
  tokenVersion?: number;
}): Promise<{ token: string; maxAgeSeg: number }> {
  const maxAgeSeg = SESSAO_DIAS * 24 * 60 * 60;
  const payload: SessaoPayload = {
    sub: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    role: usuario.role,
    exp: Date.now() + maxAgeSeg * 1000,
    tv: usuario.tokenVersion
  };
  return { token: await assinar(payload), maxAgeSeg };
}

export async function lerSessao(req: NextRequest): Promise<SessaoPayload | null> {
  const token = req.cookies.get(NOME_COOKIE_SESSAO)?.value;
  if (!token) return null;
  return verificarToken(token);
}

// ─── Candidate Token (curto prazo, scoped por candidatura) ──────────────────

export type CandidatoPayload = { sub: string; tipo: 'candidato'; exp: number };

const CANDIDATO_TOKEN_HORAS = 24;

/**
 * Cria token de candidato: signed HMAC, 24h, scoped a uma candidatura específica.
 * Usado pelo frontend de entrevista pra autenticar requests sem login.
 */
export async function criarTokenCandidato(candidaturaId: string): Promise<string> {
  const payload: CandidatoPayload = {
    sub: candidaturaId,
    tipo: 'candidato',
    exp: Date.now() + CANDIDATO_TOKEN_HORAS * 60 * 60 * 1000
  };
  const corpo = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const chave = await chaveHmac();
  const assinaturaBuf = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo));
  const assinatura = base64urlEncode(new Uint8Array(assinaturaBuf));
  return `${corpo}.${assinatura}`;
}

/**
 * Valida token de candidato e retorna o candidaturaId se válido.
 */
export async function validarTokenCandidato(token: string): Promise<string | null> {
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
    const payload: CandidatoPayload = JSON.parse(new TextDecoder().decode(base64urlDecode(corpo)));
    if (payload.tipo !== 'candidato') return null;
    if (payload.exp < Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * Extrai candidaturaId de um request autenticado como candidato.
 * Verifica: (1) cookie de sessão de candidato OU (2) header x-candidato-token.
 */
export async function extrairCandidaturaId(req: NextRequest): Promise<string | null> {
  // Tenta cookie de candidato
  const cookieToken = req.cookies.get('v4_candidato')?.value;
  if (cookieToken) {
    return validarTokenCandidato(cookieToken);
  }
  // Tenta header (pra chamadas de API)
  const headerToken = req.headers.get('x-candidato-token');
  if (headerToken) {
    return validarTokenCandidato(headerToken);
  }
  return null;
}
