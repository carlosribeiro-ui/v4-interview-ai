import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Uso: node scripts/importar-vagas.mjs "caminho/para/vagas.csv"
const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Informe o caminho do CSV. Ex: node scripts/importar-vagas.mjs vagas.csv');
  process.exit(1);
}

const raw = fs.readFileSync(csvPath, 'utf-8');

// Parser CSV simples com suporte a campos entre aspas e quebras de linha internas.
function parseCsv(text) {
  const rows = [];
  let campo = '';
  let linha = [];
  let dentroAspas = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (dentroAspas) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        campo += c;
      }
    } else {
      if (c === '"') {
        dentroAspas = true;
      } else if (c === ',') {
        linha.push(campo);
        campo = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        linha.push(campo);
        campo = '';
        if (linha.some((v) => v.trim() !== '')) rows.push(linha);
        linha = [];
      } else {
        campo += c;
      }
    }
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    if (linha.some((v) => v.trim() !== '')) rows.push(linha);
  }
  return rows;
}

const linhas = parseCsv(raw);
const header = linhas[0].map((h) => h.trim());
const idx = (nome) => header.indexOf(nome);

const iNome = idx('nome');
const iDesc = idx('descricao');
const iNota = idx('nota_minima');
const iTa = idx('talent_acquisition_nome');
const iCoploy = idx('coploy_job_id');

function separaCargoSenioridade(nome) {
  const partes = nome.split(' - ');
  if (partes.length >= 2) {
    const senioridade = partes[partes.length - 1].trim();
    const cargo = partes.slice(0, -1).join(' - ').trim();
    return { cargo, senioridade };
  }
  return { cargo: nome.trim(), senioridade: 'Não especificada' };
}

function perguntasBase(cargo, senioridade, descricao) {
  // Placeholder até regenerar com IA (requer ANTHROPIC_API_KEY).
  return [
    {
      texto: `Conte sobre sua experiência mais relevante para a vaga de ${cargo} (${senioridade}).`,
      criterios: `Experiência prática compatível com ${senioridade}; contexto: ${descricao}`
    },
    {
      texto: `Descreva um desafio real que você enfrentou relacionado a: ${descricao} Como você resolveu?`,
      criterios: 'Clareza na descrição do problema, ação tomada e resultado mensurável.'
    },
    {
      texto: `Por que você se considera um bom fit para atuar como ${cargo} na V4 Company?`,
      criterios: 'Alinhamento cultural, motivação e entendimento do papel.'
    }
  ];
}

const vagas = linhas.slice(1).map((cols) => {
  const nome = (cols[iNome] ?? '').trim();
  const descricao = (cols[iDesc] ?? '').trim();
  const { cargo, senioridade } = separaCargoSenioridade(nome);
  return {
    id: randomUUID(),
    cargo,
    senioridade,
    segmento: 'V4 Company — Recrutamento interno',
    requisitos: descricao ? [descricao] : [],
    perguntas: perguntasBase(cargo, senioridade, descricao).map((p) => ({
      id: randomUUID(),
      texto: p.texto,
      criterios: p.criterios
    })),
    createdAt: new Date().toISOString(),
    // Metadados extras vindos da Coploy (não usados pela app, guardados para referência):
    _meta: {
      notaMinima: iNota >= 0 ? Number(cols[iNota]) || null : null,
      talentAcquisition: iTa >= 0 ? (cols[iTa] ?? '').trim() : '',
      coployJobUrl: iCoploy >= 0 ? (cols[iCoploy] ?? '').trim() : ''
    }
  };
});

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dest = path.join(dataDir, 'vagas.json');
fs.writeFileSync(dest, JSON.stringify(vagas, null, 2), 'utf-8');

console.log(`Importadas ${vagas.length} vagas para ${dest}`);
console.log('Cargos:', [...new Set(vagas.map((v) => v.cargo))].join(', '));
