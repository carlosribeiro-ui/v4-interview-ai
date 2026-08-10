/**
 * Script para criar users em batch via API.
 * Roda: node scripts/create-users.js
 * Requer que o dev server esteja rodando (npm run dev) ou use a URL de produção.
 */

const BASE = process.env.API_URL || 'http://localhost:3001';

const USERS = [
  { nome: 'Julia Perin', email: 'julia.perin@v4company.com', role: 'talent' },
  { nome: 'Jéssica Maria Silva', email: 'jessicamaria.silva@v4company.com', role: 'talent' },
  { nome: 'Gabriella Zappelini', email: 'gabriella.zappelini@v4company.com', role: 'talent' },
  { nome: 'Jonathan Baumgarten', email: 'jonathan.baumgarten@v4company.com', role: 'talent' },
  { nome: 'Carlos Ribeirowho', email: 'carlos.ribeiro@v4company.com', role: 'admin' },
  { nome: 'Julia Lorca', email: 'julia.lorca@v4company.com', role: 'talent' },
  { nome: 'Francesca Druzian', email: 'francesca.druzian@v4company.com', role: 'talent' },
  { nome: 'Renata Bragante', email: 'renata.bragante@v4company.com', role: 'talent' },
  { nome: 'Thais Camila', email: 'thais.camila@v4company.com', role: 'talent' }
];

const SENHA_DEFAULT = 'V4Entrevista2026';

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@v4company.com', senha: 'v4admin2026' }),
    credentials: 'include'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Login falhou: ${err.error}`);
  }
  // Pega o cookie da sessão
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.map(c => c.split(';')[0]).join('; ');
}

async function criarUser(sessionCookie, user) {
  const res = await fetch(`${BASE}/api/usuarios`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({ ...user, senha: SENHA_DEFAULT })
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log('Fazendo login como admin...');
  const cookie = await login();
  console.log('Login OK!\n');

  let criados = 0;
  let erros = 0;

  for (const user of USERS) {
    process.stdout.write(`${user.email} (${user.role})... `);
    const result = await criarUser(cookie, user);
    if (result.ok) {
      console.log('✓ criado');
      criados++;
    } else {
      console.log(`✗ ${result.data.error}`);
      erros++;
    }
  }

  console.log(`\nResumo: ${criados} criados, ${erros} erros`);
  console.log(`Senha padrão para todos: ${SENHA_DEFAULT}`);
}

main().catch(console.error);
