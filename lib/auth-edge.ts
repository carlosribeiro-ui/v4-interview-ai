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

// ─── Token de gravação (anti-fraude: prova que a resposta passou pelo fluxo real) ──────

/**
 * Emitido quando a gravação de uma pergunta específica começa de verdade no navegador
 * (MediaRecorder.start()) — o upload da resposta (POST .../respostas) exige esse token.
 * Não prova biometricamente que é uma câmera real (JS no browser sempre pode ser
 * manipulado), mas fecha a brecha óbvia: enviar um vídeo qualquer direto pra API sem
 * nunca ter passado pelo fluxo de gravação da tela — precisa, no mínimo, ter chamado
 * o endpoint de início pra essa candidatura+pergunta específica e esperado um tempo
 * plausível (curva de leitura + gravação) antes do upload ser aceito.
 */
export type GravacaoPayload = { candidaturaId: string; perguntaId: string; iniciadoEm: number; exp: number };

const GRAVACAO_TTL_MS = 10 * 60 * 1000; // 10min — cobre leitura (20s) + resposta (até 60s) + upload lento; folga generosa de propósito
const GRAVACAO_MIN_ELAPSED_MS = 2000; // upload em menos de 2s do início é fisicamente implausível

export async function criarTokenGravacao(candidaturaId: string, perguntaId: string): Promise<string> {
  const agora = Date.now();
  const payload: GravacaoPayload = { candidaturaId, perguntaId, iniciadoEm: agora, exp: agora + GRAVACAO_TTL_MS };
  const corpo = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const chave = await chaveHmac();
  const assinaturaBuf = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo));
  const assinatura = base64urlEncode(new Uint8Array(assinaturaBuf));
  return `${corpo}.${assinatura}`;
}

export async function validarTokenGravacao(
  token: string,
  candidaturaId: string,
  perguntaId: string
): Promise<{ ok: true; iniciadoEm: number } | { ok: false; erro: string }> {
  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return { ok: false, erro: 'Token de gravação ausente ou inválido' };
  try {
    const chave = await chaveHmac();
    const valido = await crypto.subtle.verify(
      'HMAC',
      chave,
      base64urlDecode(assinatura) as BufferSource,
      new TextEncoder().encode(corpo)
    );
    if (!valido) return { ok: false, erro: 'Token de gravação inválido' };

    const payload: GravacaoPayload = JSON.parse(new TextDecoder().decode(base64urlDecode(corpo)));
    if (payload.candidaturaId !== candidaturaId || payload.perguntaId !== perguntaId) {
      return { ok: false, erro: 'Token de gravação não corresponde a esta pergunta' };
    }
    if (payload.exp < Date.now()) {
      return { ok: false, erro: 'Tempo de resposta expirado — recarregue a página e responda novamente' };
    }
    if (Date.now() - payload.iniciadoEm < GRAVACAO_MIN_ELAPSED_MS) {
      return { ok: false, erro: 'Resposta enviada rápido demais — grave a resposta em tempo real' };
    }
    // iniciadoEm sai daqui porque é o relógio CONFIÁVEL (assinado pelo servidor) da abertura
    // desta pergunta — a análise forense do vídeo compara a duração do arquivo contra essa
    // janela. Ver lib/video-forense.ts::analisarIntegridadeVideo.
    return { ok: true, iniciadoEm: payload.iniciadoEm };
  } catch {
    return { ok: false, erro: 'Token de gravação inválido' };
  }
}
