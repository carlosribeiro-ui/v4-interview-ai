import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
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
};

async function usuariosCollection() {
  const db = await getDb();
  return db.collection<Usuario>('usuarios');
}

function hashSenha(senhaPlana: string): string {
  const salt = randomBytes(16).toString('hex');
  // V-15 FIX: N=65536, r=8, p=1 — work factor adequado pra 2026
  const hash = scryptSync(senhaPlana, salt, 64, { N: 65536, r: 8, p: 1 }).toString('hex');
  return `${salt}:${hash}`;
}

function verificarSenha(senhaPlana: string, armazenada: string): boolean {
  const [salt, hash] = armazenada.split(':');
  if (!salt || !hash) return false;
  const hashTentativa = scryptSync(senhaPlana, salt, 64, { N: 65536, r: 8, p: 1 });
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
  return usuarios.map(({ senha: _senha, _id, ...resto }: any) => resto);
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
 * Incrementa tokenVersion de um usuário — chamado quando a senha muda
 * ou quando o admin quer forçar logout de todos os dispositivos.
 */
export async function revogarSessoes(id: string): Promise<void> {
  const col = await usuariosCollection();
  await col.updateOne({ id }, { $inc: { tokenVersion: 1 } });
}
