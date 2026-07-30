# V4 Interview AI — MVP local

Clone funcional (MVP) da Coploy: entrevistas assíncronas em vídeo avaliadas por IA. Roda 100% local, sem mensalidade de SaaS — só paga o uso de API. **Provedor único: Gemini 2.5 Flash (Google)** — geração de roteiro, transcrição de áudio, análise de frames e avaliação. Uma chave só, o caminho mais barato.

## Fluxo

1. **Admin cria a vaga** (`/`): informa cargo, senioridade e segmento. A IA (Gemini 2.5 Flash) gera automaticamente os requisitos e as perguntas da entrevista, com os critérios técnicos de cada pergunta. Vagas também podem ser criadas por um sistema externo via API (ver seção abaixo).
2. **Admin compartilha o link do candidato** (`/vagas/[id]` → botão "Copiar"): `/entrevista/[vagaId]`.
3. **Candidato responde** (`/entrevista/[vagaId]`): preenche nome/e-mail (+ LinkedIn, telefone, pretensão salarial e currículo em PDF, todos opcionais) e grava uma resposta em vídeo por pergunta direto no navegador (webcam + microfone). Pode clicar em "🔊 Ouvir pergunta" para a pergunta ser lida em voz alta antes de gravar. Cada resposta é enviada assim que gravada.
4. **IA avalia automaticamente** cada resposta: o Gemini 2.5 Flash transcreve o áudio do vídeo (áudio nativo, sem Whisper) e dá nota de 0 a 10 + feedback técnico, comparando com os critérios da pergunta. Quando há frames do vídeo, também estima se o candidato está lendo um script.
5. **Admin acompanha o pipeline de seleção** (`/vagas/[id]`): candidatos organizados em kanban por fase, com nota, vídeo, transcrição e feedback de cada resposta. O admin move o candidato arrastando o card (drag&drop) ou pelo seletor no card.

## Pipeline de seleção (kanban editável por vaga)

Cada vaga tem sua própria lista de fases (`Vaga.fases`, editável em "⚙ Gerenciar fases" na página da vaga) — por padrão vem semeada com `Triagem → Entrevista → Aprovado/Reprovado`, mas dá pra renomear, reordenar, trocar a cor semântica (neutro/atenção/sucesso/perigo) e criar/excluir fases por vaga. `Candidatura.fase` referencia o `id` de uma dessas fases.

- `PATCH /api/vagas/<id>/fases` — body `{ "fases": [{ "id": "...", "nome": "...", "cor": "neutro|atencao|sucesso|perigo" }] }` — substitui a lista inteira. Bloqueia (409) a exclusão de uma fase que ainda tem candidatos.
- `PATCH /api/candidaturas/<id>/fase` — body `{ "fase": "<id de uma fase da vaga>" }` — move o candidato.
- Card do kanban tem uma alça de arrastar (⠿, drag&drop via `@dnd-kit`) e um `<select>` como alternativa.

## Campos de ATS e notas internas

Além de nome/e-mail, a candidatura aceita opcionalmente `linkedin`, `telefone`, `pretensaoSalarial` e um currículo em PDF (enviado em `POST /api/candidaturas/<id>/curriculo`, multipart, campo `curriculo`). Esses dados aparecem no card expandido de `/vagas/[id]`.

O recrutador também pode registrar comentários internos por candidato (nunca mostrados ao candidato) em `POST /api/candidaturas/<id>/notas` — body `{ "texto": "..." }` — visíveis e adicionáveis direto no card expandido.

## Documentação da API (Swagger)

Todas as rotas (internas e `/api/integracoes/*`) estão documentadas em OpenAPI 3.0 (`lib/openapi.ts`, mantida à mão):

- `/docs` — Swagger UI navegável no próprio app.
- `GET /api/openapi.json` — spec crua, pra importar em Postman/Insomnia ou gerar clientes.

## API externa (criar/consultar vagas de outro sistema)

Além do painel admin, vagas podem ser criadas e consultadas por um sistema externo (n8n, automação do Pipefy etc.) via `/api/integracoes/*`, autenticado por header `x-api-key`.

```bash
# Gerar a chave uma vez e colar em .env.local como EXTERNAL_API_KEY
openssl rand -hex 32
```

```bash
# Criar vaga (mesma geração de roteiro via IA do painel admin)
curl -X POST http://localhost:3001/api/integracoes/vagas \
  -H "x-api-key: SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"cargo":"Desenvolvedor Backend","senioridade":"Pleno","segmento":"RH tech","externalId":"pipefy-12345","origem":"pipefy"}'

# Listar vagas (opcionalmente filtrando pelo id do sistema externo)
curl "http://localhost:3001/api/integracoes/vagas?externalId=pipefy-12345" -H "x-api-key: SUA_CHAVE"

# Consultar status/fase das candidaturas de uma vaga (pra sincronizar de volta no sistema externo)
curl "http://localhost:3001/api/integracoes/candidaturas?vagaExternalId=pipefy-12345" -H "x-api-key: SUA_CHAVE"
```

`externalId`/`origem` são opcionais e servem só de correlação (ex: ID do card no Pipefy) — não há integração automática com nenhum sistema específico, é uma API genérica. Sem `EXTERNAL_API_KEY` configurada no `.env.local`, essas rotas respondem 500 (recusam funcionar sem chave). O painel admin local continua sem autenticação, como já documentado nas limitações abaixo.

## Setup

```bash
npm install
cp .env.local.example .env.local
# edite .env.local e preencha a ÚNICA chave necessária:
#   GEMINI_API_KEY=...   (https://aistudio.google.com/app/apikey)
npm run dev
```

Abra `http://localhost:3001` (porta fixada no `package.json`).

> Gravação de vídeo requer HTTPS ou `localhost` (não funciona em IP de rede tipo `192.168.x.x` sem certificado). Para testar em outro dispositivo na mesma rede, use uma ferramenta de túnel (ex.: `ngrok http 3000`).

## Onde os dados ficam

- `data/vagas.json` e `data/candidaturas.json` — banco de dados local em arquivo JSON (sem Postgres/Supabase nessa fase).
- `public/uploads/<candidaturaId>/<perguntaId>.webm` — vídeos das respostas.

Tudo isso é local e está no `.gitignore` — não sobe pro git.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Gemini 2.5 Flash via REST (`fetch`, sem SDK) — provedor único para tudo:
  - `lib/llm.ts` — geração do roteiro, avaliação das respostas, análise de frames e análise de perguntas
  - `lib/transcribe.ts` — transcrição do áudio do vídeo (`inlineData`, mesmo modelo)
  - `lib/vagas.ts` — criação de vaga (gera roteiro + grava), compartilhada entre o painel admin e a API externa
  - `lib/auth-externa.ts` — checagem da `x-api-key` das rotas `/api/integracoes/*`
  - `lib/openapi.ts` — spec OpenAPI 3.0 servida em `/api/openapi.json` e renderizada em `/docs`
- Voz da pergunta lida pro candidato: `SpeechSynthesis` nativo do navegador (Web Speech API) — sem custo, sem chave de API, qualidade da voz varia por navegador/SO (não passa pelo Gemini).
- Kanban: `@dnd-kit/core` (drag&drop) e `swagger-ui-react` (página `/docs`) — únicas libs de UI adicionadas além do stack base.

Nenhuma dependência de OpenAI/Anthropic: o pacote `openai` foi removido do `package.json`.

## Limitações conhecidas do MVP (não é produção ainda)

- Sem autenticação no painel admin — qualquer pessoa com o link `/vagas/[id]` vê o pipeline de candidatos. As rotas `/api/integracoes/*` têm uma chave própria (`x-api-key`), mas é uma checagem simples (sem rotação, sem escopos).
- Banco em arquivo JSON (sem concorrência real, ok para teste com poucos candidatos simultâneos).
- Next.js está na versão 14.2.18, que tem CVEs conhecidos (DoS/SSRF em features que este MVP não usa — sem middleware, sem Image Optimization, sem rewrites). Aceitável para teste local; **precisa ser revisto/atualizado antes de qualquer exposição pública.**
- Sem fila/retry: se a transcrição ou avaliação falhar (ex.: chave de API errada), o candidato vê erro e pode tentar reenviar a mesma resposta.
- Testado para gravação em Chrome/Edge desktop (formato `webm`). Safari/iOS pode gerar `mp4` — o backend já aceita os dois, mas não foi testado.
- "🔊 Ouvir pergunta" some se o navegador não suporta `SpeechSynthesis` (raro, mas Safari/iOS mais antigo pode variar); a voz/idioma depende das vozes instaladas no SO do candidato, não é controlada pelo backend.
- Movimentação de fase é manual (sem drag-and-drop) e não dispara nenhuma notificação — só grava o campo `fase` da candidatura.

## Próximos passos sugeridos (pós-MVP)

- Trocar JSON por Postgres (Supabase, mesmo padrão usado no People Broker e no V4 Cup).
- Autenticação simples no painel admin.
- Deploy (Vercel + Render, mesmo padrão de outros projetos V4) se o teste local validar a qualidade da avaliação.
- Comparar custo real por entrevista (Gemini 2.5 Flash, provedor único) vs. os R$18k/mês pagos à Coploy.
- A transcrição envia o vídeo inteiro em base64 no corpo da requisição (limite ~20 MB por request na API inline). Para respostas mais longas, migrar para a Files API do Gemini.
