/**
 * Seed TA users via the deployed API.
 * Roda com: npx tsx scripts/seed-ta-api.ts
 * Requer a app rodando localmente ou deployada.
 */

const BASE_URL = process.env.APP_URL || 'http://localhost:3001';
const ADMIN_EMAIL = 'admin@v4company.com';
const ADMIN_SENHA = 'v4admin2026';

const TA_USERS = [
  { nome: 'Julia Perin', email: 'julia.perin@v4company.com' },
  { nome: 'Rayane Leme', email: 'rayane.leme@v4company.com' },
  { nome: 'Jessica Maria Silva', email: 'jessicamaria.silva@v4company.com' },
  { nome: 'Gabriella Zappelini', email: 'gabriella.zappelini@v4company.com' },
  { nome: 'Ana Maykot', email: 'ana.maykot@v4company.com' },
  { nome: 'Jonathan Baumgarten', email: 'jonathan.baumgarten@v4company.com' },
  { nome: 'Carlos Ribeiro', email: 'carlos.ribeiro@v4company.com' },
  { nome: 'Julia Lorca', email: 'julia.lorca@v4company.com' },
  { nome: 'Francesca Druzian', email: 'francesca.druzian@v4company.com' },
  { nome: 'Renata Bragante', email: 'renata.bragante@v4company.com' },
];

async function main() {
  console.log(`[Seed TA] Conectando em ${BASE_URL}`);

  // 1. Login as admin to get session cookie
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, senha: ADMIN_SENHA }),
    redirect: 'manual'
  });

  if (!loginRes.ok) {
    const err = await loginRes.text();
    console.error(`Login falhou (${loginRes.status}):`, err);
    process.exit(1);
  }

  const cookie = loginRes.headers.get('set-cookie');
  if (!cookie) {
    console.error('Login não retornou cookie de sessão');
    process.exit(1);
  }
  console.log('[Seed TA] Login OK');

  // 2. Create each TA user
  let created = 0;
  let skipped = 0;

  for (const ta of TA_USERS) {
    const res = await fetch(`${BASE_URL}/api/usuarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie
      },
      body: JSON.stringify({
        nome: ta.nome,
        email: ta.email,
        role: 'talent',
        senha: 'TA2026!'
      })
    });

    if (res.status === 201) {
      console.log(`  CRIADO: ${ta.nome} <${ta.email}>`);
      created++;
    } else if (res.status === 409) {
      console.log(`  SKIP (já existe): ${ta.email}`);
      skipped++;
    } else {
      const err = await res.text();
      console.error(`  ERRO (${res.status}): ${ta.email} — ${err}`);
    }
  }

  console.log(`\nResumo: ${created} criados, ${skipped} já existiam`);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
