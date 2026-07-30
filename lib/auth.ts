import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import type { Role } from './auth-edge';
import { getDb } from './mongodb';

export type { Role, SessaoPayload } from './auth-edge';
export { criarTokenSessao, lerSessao, NOME_COOKIE_SESSAO } from './auth-edge';

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  /** formato "salt:hash", ambos hex — scrypt, sem dependência externa. */
  senha: string;
};

async function usuariosCollection() {
  const db = await getDb();
  return db.collection<Usuario>('usuarios');
}

function hashSenha(senhaPlana: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senhaPlana, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verificarSenha(senhaPlana: string, armazenada: string): boolean {
  const [salt, hash] = armazenada.split(':');
  if (!salt || !hash) return false;
  const hashTentativa = scryptSync(senhaPlana, salt, 64);
  const hashArmazenado = Buffer.from(hash, 'hex');
  if (hashTentativa.length !== hashArmazenado.length) return false;
  return timingSafeEqual(hashTentativa, hashArmazenado);
}

/** Cria a base de usuários na primeira execução (admin + talent), com senha em .env.local ou gerada. */
export async function garantirUsuariosSeed(): Promise<{ criados: boolean; senhaAdmin?: string; senhaTalent?: string }> {
  const col = await usuariosCollection();
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
      senha: hashSenha(senhaAdmin)
    },
    {
      id: 'talent-1',
      nome: 'Talent V4',
      email: 'talent@v4company.com',
      role: 'talent',
      senha: hashSenha(senhaTalent)
    }
  ];

  await col.insertMany(usuarios);
  return { criados: true, senhaAdmin, senhaTalent };
}

export async function autenticar(email: string, senha: string): Promise<Usuario | null> {
  const col = await usuariosCollection();
  const usuario = await col.findOne({ email: email.trim().toLowerCase() });
  if (!usuario) return null;
  if (!verificarSenha(senha, usuario.senha)) return null;
  return usuario;
}
