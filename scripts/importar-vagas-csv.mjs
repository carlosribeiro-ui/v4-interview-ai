/**
 * Importa as vagas auditadas (Check=TRUE) do catálogo "Vagas Coploy" (CSV fonte da verdade,
 * 2026-08-14) direto pro Mongo, sem passar pela geração por IA (lib/llm.ts) — as perguntas já
 * vêm prontas, revisadas por humano e ancoradas em JD real.
 *
 * Uso:
 *   node scripts/importar-vagas-csv.mjs                # dry-run (não escreve nada)
 *   node scripts/importar-vagas-csv.mjs --commit        # escreve de verdade no Mongo
 *
 * Entrada: scratchpad/vagas-auditadas.json (gerado do CSV via PowerShell Import-Csv — ver
 * histórico da conversa 2026-08-14). Cada vaga é upsertada por (cargo, senioridade): se já
 * existe uma vaga com esse par, ATUALIZA perguntas/requisitos/descrição; senão cria nova.
 * Novas vagas entram com `ativa: false` — não aparecem em /entrevista nem na LP até alguém
 * revisar e ativar manualmente (ver bulk "Reativar" em / — dashboard).
 */
import { MongoClient } from 'mongodb';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

// Sem dependência de `dotenv` (não está no package.json) — parser manual bem simples,
// só pra pegar MONGODB_URI do .env.local (mesmo arquivo que o Next.js usa em dev).
function carregarEnvLocal() {
  const path = new URL('../.env.local', import.meta.url);
  const texto = readFileSync(path, 'utf8');
  for (const linha of texto.split('\n')) {
    const l = linha.trim();
    if (!l || l.startsWith('#')) continue;
    const idx = l.indexOf('=');
    if (idx === -1) continue;
    const chave = l.slice(0, idx).trim();
    let valor = l.slice(idx + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (!process.env[chave]) process.env[chave] = valor;
  }
}
carregarEnvLocal();

const COMMIT = process.argv.includes('--commit');
const JSON_PATH = 'C:\\Users\\CARLOS~1.RIB\\AppData\\Local\\Temp\\claude\\C--Users-carlos-ribeiro-v4com\\47c859c4-18a4-4baf-97f8-631abe2d5254\\scratchpad\\vagas-auditadas.json';

const FASES_PADRAO = [
  { id: 'triagem', nome: 'Triagem', ordem: 0 },
  { id: 'aprovados', nome: 'Aprovados', ordem: 1 },
  { id: 'reprovados', nome: 'Reprovados', ordem: 2 }
];

function montarRequisitos(requisitosTexto) {
  // Coluna "Requisitos" do CSV é um parágrafo corrido (frases separadas por ". "), não uma
  // lista — quebra em frases pra bater com o formato array que Vaga.requisitos espera.
  return requisitosTexto
    .split(/(?<=[.;])\s+(?=[A-ZÀ-Ú])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function montarPerguntas(row) {
  const categorias = [
    ['P1', 'principal', 'Abertura'],
    ['P2', 'principal', 'Técnica'],
    ['P3', 'principal', 'Situacional'],
    ['P4', 'adicional', 'Diagnóstico'],
    ['P5', 'adicional', 'Evidência Técnica'],
    ['P6', 'adicional', 'Decisão sob Restrição']
  ];
  return categorias
    .filter(([campo]) => row[campo] && row[campo].trim())
    .map(([campo, tipo, categoria]) => ({
      id: randomUUID(),
      texto: row[campo].trim(),
      criterios: `Categoria: ${categoria}. Avaliar conforme o "Nível de expectativa para avaliação" descrito nos requisitos da vaga (${row.Senioridade}).`,
      tipo
    }));
}

async function main() {
  const rows = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  console.log(`Lidas ${rows.length} vagas auditadas do CSV.\n`);

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI ausente — confira .env.local');
  const client = new MongoClient(uri, { family: 4 });
  await client.connect();
  const db = client.db();
  const col = db.collection('vagas');

  let criadas = 0;
  let atualizadas = 0;
  const problemas = [];

  for (const row of rows) {
    const cargo = row.Cargo?.trim();
    const senioridade = row.Senioridade?.trim();
    if (!cargo || !senioridade) {
      problemas.push(`Linha sem cargo/senioridade: ${JSON.stringify(row).slice(0, 80)}`);
      continue;
    }

    const existente = await col.findOne({ cargo, senioridade });
    const perguntas = montarPerguntas(row);
    if (perguntas.length === 0) {
      problemas.push(`${cargo} / ${senioridade}: zero perguntas — pulei.`);
      continue;
    }

    const camposComuns = {
      cargo,
      senioridade,
      segmento: row.Segmento?.trim() || 'Outro',
      requisitos: montarRequisitos(row.Requisitos || ''),
      jobDescription: row.Descricao?.trim(),
      formacaoAcademica: row.Formacao?.trim() || undefined,
      origem: 'catalogo-vagas-coploy',
      externalId: row.ID?.trim() || undefined
    };

    if (existente) {
      // V-SEC (integridade de dados): se já existe candidatura com resposta pra essa vaga,
      // NÃO mexe em `perguntas` — trocar o array quebraria o vínculo perguntaId ↔ resposta
      // já gravada (o parecer/perfil do candidato passaria a mostrar "Pergunta" genérico em
      // vez do texto real). Só atualiza descrição/requisitos/segmento nesse caso.
      const candidaturasCol = db.collection('candidaturas');
      const temRespostas = await candidaturasCol.countDocuments({
        vagaId: existente.id,
        'respostas.0': { $exists: true }
      });
      const podeTrocarPerguntas = temRespostas === 0;

      atualizadas++;
      console.log(
        `~ atualizar: ${cargo} / ${senioridade} (id existente ${existente.id})` +
          (podeTrocarPerguntas ? '' : ` [${temRespostas} candidatura(s) com resposta — perguntas preservadas]`)
      );
      if (COMMIT) {
        const set = podeTrocarPerguntas ? { ...camposComuns, perguntas } : camposComuns;
        await col.updateOne({ id: existente.id }, { $set: set, $inc: { version: 1 } });
      }
    } else {
      criadas++;
      console.log(`+ criar: ${cargo} / ${senioridade}`);
      if (COMMIT) {
        await col.insertOne({
          id: randomUUID(),
          ...camposComuns,
          perguntas,
          fases: FASES_PADRAO,
          createdAt: new Date().toISOString(),
          version: 0,
          ativa: false // revisão manual antes de publicar — ver README do script
        });
      }
    }
  }

  console.log(`\n${COMMIT ? 'COMMIT' : 'DRY-RUN'} — criadas: ${criadas}, atualizadas: ${atualizadas}, problemas: ${problemas.length}`);
  if (problemas.length) {
    console.log('\nProblemas:');
    problemas.forEach((p) => console.log(' - ' + p));
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
