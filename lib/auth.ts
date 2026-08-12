import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import type { Role } from './auth-edge';
import { getDb } from './mongodb';

export type { Role, SessaoPayload } from './auth-edge';
export { criarTokenSessao, lerSessao, NOME_COOKIE_SESSAO } from './auth-edge';
export { criarTokenCandidato, validarTokenCandidato, extrairCandidaturaId } from './auth-edge';

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  /** formato "salt:hash", ambos hex — scrypt, sem dependência externa. */
  senha: string;
  /** Versão do token — incrementada em delete/password change pra revogar sessões antigas. */
  tokenVersion?: number;
  /** Usuário inativo não consegue logar. Ausente = ativo (default true, compat com registros antigos). */
  ativo?: boolean;
  /** SHA-256 do token de "esqueci minha senha" ativo (nunca guardamos o token em texto puro). */
  resetTokenHash?: string;
  /** ISO date — token de reset expira em 30min. Ausente/passado = token inválido. */
  resetTokenExpira?: string;
};

async function usuariosCollection() {
  const db = await getDb();
  return db.collection<Usuario>('usuarios');
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function hashSenha(senhaPlana: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senhaPlana, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString('hex');
  return `${salt}:${hash}`;
}

function verificarSenha(senhaPlana: string, armazenada: string): boolean {
  const [salt, hash] = armazenada.split(':');
  if (!salt || !hash) return false;
  const hashTentativa = scryptSync(senhaPlana, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  const hashArmazenado = Buffer.from(hash, 'hex');
  if (hashTentativa.length !== hashArmazenado.length) return false;
  return timingSafeEqual(hashTentativa, hashArmazenado);
}

/**
 * Cria a base de usuários na primeira execução (admin + talent).
 * Race-safe: se dois cold starts tentam criar ao mesmo tempo, o segundo
 * captura o duplicate key error e retorna { criados: false }.
 */
export async function garantirUsuariosSeed(): Promise<{ criados: boolean; senhaAdmin?: string; senhaTalent?: string }> {
  const col = await usuariosCollection();

  // Ensure unique index on email (idempotent)
  await col.createIndex({ email: 1 }, { unique: true, sparse: true });

  const existentes = await col.countDocuments();
  if (existentes > 0) return { criados: false };

  const senhaAdmin = process.env.SEED_ADMIN_SENHA || randomBytes(6).toString('hex');
  const senhaTalent = process.env.SEED_TALENT_SENHA || randomBytes(6).toString('hex');

  const usuarios: Usuario[] = [
    {
      id: 'admin-1',
      nome: 'Admin V4',
      email: 'admin@v4company.com',
      role: 'admin',
      senha: hashSenha(senhaAdmin),
      tokenVersion: 0
    },
    {
      id: 'talent-1',
      nome: 'Talent V4',
      email: 'talent@v4company.com',
      role: 'talent',
      senha: hashSenha(senhaTalent),
      tokenVersion: 0
    }
  ];

  try {
    await col.insertMany(usuarios);
    return { criados: true, senhaAdmin, senhaTalent };
  } catch (err: any) {
    // Duplicate key = outro cold start já criou
    if (err?.code === 11000) return { criados: false };
    throw err;
  }
}

export async function autenticar(email: string, senha: string): Promise<Usuario | null> {
  const col = await usuariosCollection();
  const usuario = await col.findOne({ email: email.trim().toLowerCase() });
  if (!usuario) return null;
  if (usuario.ativo === false) return null; // V-SEC: usuário desativado não loga
  if (!verificarSenha(senha, usuario.senha)) return null;
  return usuario;
}

/**
 * Verifica se o tokenVersion da sessão bate com o do DB.
 * Necessário porque lerSessao (Edge) não acessa MongoDB — sessões de usuários
 * deletados ou com senha alterada permanecem válidas até expirar (7 dias)
 * sem esta checagem.
 *
 * Retorna true se a sessão é válida (tokenVersion bate ou usuário não existe mais).
 * Retorna false se tokenVersion diverge (sessão revogada).
 */
export async function verificarTokenVersion(sessao: { sub: string; tv?: number }): Promise<boolean> {
  const col = await usuariosCollection();
  const usuario = await col.findOne({ id: sessao.sub });
  if (!usuario) return false; // Usuário deletado — sessão inválida
  const tvSessao = sessao.tv ?? 0;
  const tvDb = usuario.tokenVersion ?? 0;
  return tvSessao >= tvDb;
}

export type UsuarioPublico = Omit<Usuario, 'senha'>;

export async function listarUsuarios(): Promise<UsuarioPublico[]> {
  const col = await usuariosCollection();
  const usuarios = await col.find({}).sort({ nome: 1 }).toArray();
  return usuarios.map(({ senha: _senha, _id, ativo, ...resto }: any) => ({ ...resto, ativo: ativo ?? true }));
}

export async function criarUsuario(dados: { nome: string; email: string; role: Role; senha: string }): Promise<UsuarioPublico> {
  const col = await usuariosCollection();
  const email = dados.email.trim().toLowerCase();

  const usuario: Usuario = {
    id: randomUUID(),
    nome: dados.nome.trim(),
    email,
    role: dados.role,
    senha: hashSenha(dados.senha),
    tokenVersion: 0
  };

  try {
    await col.insertOne(usuario);
  } catch (err: any) {
    if (err?.code === 11000) throw new Error('Já existe um usuário com este e-mail');
    throw err;
  }

  return { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role };
}

export async function contarAdmins(): Promise<number> {
  const col = await usuariosCollection();
  return col.countDocuments({ role: 'admin' });
}

export async function buscarUsuarioPorId(id: string): Promise<Usuario | null> {
  const col = await usuariosCollection();
  return col.findOne({ id });
}

/**
 * Incrementa tokenVersion antes de deletar — qualquer JWT antigo com o
 * tokenVersion anterior será rejeitado quando o route handler checar.
 */
export async function excluirUsuario(id: string): Promise<void> {
  const col = await usuariosCollection();
  // Incrementa tokenVersion primeiro pra revogar sessões existentes
  await col.updateOne({ id }, { $inc: { tokenVersion: 1 } });
  await col.deleteOne({ id });
}

/**
 * Altera a role de um usuário (admin ↔ talent).
 * Incrementa tokenVersion pra revogar sessões antigas com permissão antiga.
 */
export async function atualizarRole(id: string, novaRole: Role): Promise<void> {
  const col = await usuariosCollection();
  await col.updateOne(
    { id },
    { $set: { role: novaRole }, $inc: { tokenVersion: 1 } }
  );
}

/**
 * Incrementa tokenVersion de um usuário — chamado quando a senha muda
 * ou quando o admin quer forçar logout de todos os dispositivos.
 */
export async function revogarSessoes(id: string): Promise<void> {
  const col = await usuariosCollection();
  await col.updateOne({ id }, { $inc: { tokenVersion: 1 } });
}

/**
 * Ativa/desativa um usuário. Desativado não consegue mais logar (ver autenticar())
 * e tem as sessões existentes revogadas na hora.
 */
export async function atualizarAtivo(id: string, ativo: boolean): Promise<void> {
  const col = await usuariosCollection();
  await col.updateOne({ id }, { $set: { ativo }, $inc: { tokenVersion: 1 } });
}

/**
 * Admin edita nome/e-mail de qualquer usuário. E-mail precisa continuar único.
 */
export async function atualizarDadosAdmin(id: string, dados: { nome?: string; email?: string }): Promise<void> {
  const col = await usuariosCollection();
  const set: Record<string, string> = {};
  if (dados.nome !== undefined) set.nome = dados.nome.trim();
  if (dados.email !== undefined) set.email = dados.email.trim().toLowerCase();
  if (Object.keys(set).length === 0) return;
  try {
    await col.updateOne({ id }, { $set: set });
  } catch (err: any) {
    if (err?.code === 11000) throw new Error('Já existe um usuário com este e-mail');
    throw err;
  }
}

/**
 * Admin reseta a senha de qualquer usuário sem precisar da senha atual.
 * Revoga sessões existentes (força novo login com a senha nova).
 */
export async function resetarSenhaAdmin(id: string, novaSenha: string): Promise<void> {
  const col = await usuariosCollection();
  await col.updateOne({ id }, { $set: { senha: hashSenha(novaSenha) }, $inc: { tokenVersion: 1 } });
}

/**
 * Usuário edita o próprio nome/e-mail (qualquer role — admin ou talent).
 */
export async function atualizarPerfilProprio(id: string, dados: { nome?: string; email?: string }): Promise<Usuario> {
  await atualizarDadosAdmin(id, dados);
  const col = await usuariosCollection();
  const atualizado = await col.findOne({ id });
  if (!atualizado) throw new Error('Usuário não encontrado');
  return atualizado;
}

/**
 * Usuário troca a própria senha — exige a senha atual correta.
 * Retorna o novo tokenVersion (pro caller reemitir o cookie de sessão,
 * já que a troca revoga o token que acabou de ser usado nesta mesma request).
 */
export async function alterarSenhaPropria(
  id: string,
  senhaAtual: string,
  novaSenha: string
): Promise<{ ok: true; usuario: Usuario } | { ok: false; erro: string }> {
  const col = await usuariosCollection();
  const usuario = await col.findOne({ id });
  if (!usuario) return { ok: false, erro: 'Usuário não encontrado' };
  if (!verificarSenha(senhaAtual, usuario.senha)) return { ok: false, erro: 'Senha atual incorreta' };

  const novoTokenVersion = (usuario.tokenVersion ?? 0) + 1;
  await col.updateOne({ id }, { $set: { senha: hashSenha(novaSenha), tokenVersion: novoTokenVersion } });
  return { ok: true, usuario: { ...usuario, senha: hashSenha(novaSenha), tokenVersion: novoTokenVersion } };
}

// ─── "Esqueci minha senha" ──────────────────────────────────────────────────

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Gera um token de reset (32 bytes aleatórios, só o HASH fica no banco — igual
 * senha) válido por 30min. Retorna o token em texto puro (só existe na memória
 * desta request, pra ir no link do e-mail) — ou null se o e-mail não existe.
 * V-SEC: o caller NUNCA deve revelar pro chamador da API se o e-mail existe ou
 * não (resposta sempre genérica) — só usa o retorno pra decidir se envia e-mail.
 */
export async function gerarTokenReset(email: string): Promise<{ token: string; nome: string } | null> {
  const col = await usuariosCollection();
  const usuario = await col.findOne({ email: email.toLowerCase().trim() });
  if (!usuario || usuario.ativo === false) return null;

  const token = randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  await col.updateOne({ id: usuario.id }, { $set: { resetTokenHash: hashToken(token), resetTokenExpira: expira } });

  return { token, nome: usuario.nome };
}

/**
 * Valida e consome o token: se válido, troca a senha, limpa o token (uso
 * único) e incrementa tokenVersion (revoga qualquer sessão antiga aberta —
 * se alguém pediu reset é porque perdeu acesso, então mata sessões velhas).
 */
export async function redefinirSenhaComToken(
  token: string,
  novaSenha: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const col = await usuariosCollection();
  const usuario = await col.findOne({ resetTokenHash: hashToken(token) });
  if (!usuario) return { ok: false, erro: 'Link inválido ou já utilizado' };
  if (!usuario.resetTokenExpira || new Date(usuario.resetTokenExpira).getTime() < Date.now()) {
    return { ok: false, erro: 'Link expirado — solicite um novo' };
  }

  const novoTokenVersion = (usuario.tokenVersion ?? 0) + 1;
  await col.updateOne(
    { id: usuario.id },
    {
      $set: { senha: hashSenha(novaSenha), tokenVersion: novoTokenVersion },
      $unset: { resetTokenHash: '', resetTokenExpira: '' }
    }
  );
  return { ok: true };
}
