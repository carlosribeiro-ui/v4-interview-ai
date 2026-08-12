# V4 Interview AI

Clone funcional da Coploy: entrevistas assíncronas em vídeo avaliadas por IA. **Provedor único: Gemini 2.5 Flash (Google)** — geração de roteiro, transcrição de áudio, análise de frames e avaliação. Uma chave só, o caminho mais barato.

**Produção:** https://v4-interview-ai.vercel.app

## Fluxo

1. **Admin cria a vaga** (`/`): informa cargo, senioridade e segmento (ou cola uma Job Description completa). A IA gera automaticamente os requisitos e as perguntas com critérios técnicos. Vagas também podem ser criadas por sistemas externos via API.
2. **Admin compartilha o link** (`/vagas/[id]` → "Copiar link"): `/entrevista/[vagaId]`.
3. **Candidato responde** (`/entrevista/[vagaId]`): preenche nome/e-mail (+ LinkedIn, telefone, pretensão salarial e CV em PDF opcionais). A gravação é automática — sem botões, sem controle manual. Cada resposta é processada em background enquanto o candidato lê a próxima pergunta.
4. **IA avalia automaticamente**: Gemini transcreve o áudio, analisa frames do vídeo (detecção de teleprompter), e gera nota 0-10 + feedback técnico calibrado por senioridade. Quando disponível, o CV/LinkedIn do candidato é usado como contexto adicional na avaliação.
5. **Admin acompanha o pipeline** (`/vagas/[id]`): kanban com drag-and-drop, nota, vídeo, transcrição, feedback detalhado e parecer final consolidado (exportável em PDF).
6. **Admin gerencia candidatos globalmente** (`/candidatos`): kanban de todas as vagas, filtros avançados, atribuição de talent, ação em massa e remoção de candidaturas (individual ou em lote — admin only).

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Banco:** MongoDB Atlas (free tier M0)
- **Armazenamento:** Cloudflare R2 (vídeos, CVs, áudio TTS)
- **Deploy:** Vercel Hobby (free) + GitHub (private)
- **IA:** Gemini 2.5 Flash (REST, sem SDK) — roteiro, avaliação, transcrição, TTS
- **Kanban:** @dnd-kit/core (drag-and-drop)
- **PDF:** @react-pdf/renderer (parecer consolidado)

## Segurança (v0.2.0)

- **RBAC centralizado:** Middleware protege rotas admin (editar/deletar vagas, remover candidaturas, gerenciar usuários, logs) e rotas que exigem sessão (criar vaga, notas internas, mover fase). Candidatos não logam — o ID da candidatura funciona como token implícito.
- **Rate limiting:** Endpoints públicos têm limite por IP (10/min pra candidaturas, 5/min pra upload de vídeo, 15/min pra TTS, 5/min pra login). Proteção contra abuse e brute force.
- **Session auth:** Cookie HMAC-SHA256, 7 dias, roles `admin`/`talent`. Senhas com scrypt (64 bytes).
- **Input validation (anti-NoSQL injection):** Campos do body que alimentam filtro Mongo (`vagaId`, `email`, etc. em `/api/candidaturas` e `/api/auth/login`) são validados com `typeof === 'string'` antes de chegar no `findOne` — bloqueia operadores (`$ne`, `$gt`) enviados no lugar de valores simples. Achado em pentest 2026-08-12.
- **Cleanup R2:** Ao deletar candidatura/vaga, arquivos órfãos são removidos do R2 (best-effort).
- **Monitoramento:** Wrapper estruturado de erros (`lib/monitoring.ts`), pronto pra Sentry (DSN configurado = ativo).

## Setup

```bash
npm install
cp .env.local.example .env.local
# edite .env.local — variáveis obrigatórias:
#   GEMINI_API_KEY=...          (https://aistudio.google.com/app/apikey)
#   MONGODB_URI=...            (MongoDB Atlas connection string)
#   R2_ACCOUNT_ID=...          (Cloudflare R2)
#   R2_ACCESS_KEY_ID=...
#   R2_SECRET_ACCESS_KEY=...
#   R2_ENDPOINT=...
#   R2_BUCKET=...
#   R2_PUBLIC_URL=...
#   EXTERNAL_API_KEY=...       (chave pra API externa)
#   SESSION_SECRET=...         (pra production — senão usa fallback dev)
npm run dev
```

Abra `http://localhost:3001`.

> Gravação de vídeo requer HTTPS ou `localhost`. Para testar em outro dispositivo na mesma rede, use ngrok ou similar.

## Comandos

```bash
npm run dev          # Desenvolvimento (porta 3001)
npm run build        # Build de produção
npm run start        # Produção local (porta 3001)
npm run deploy       # Deploy pra Vercel production
npm run test         # Roda testes (vitest)
npm run test:watch   # Testes em watch mode
npm run typecheck    # Verifica tipos TypeScript
```

## Onde os dados ficam

- **MongoDB Atlas** (`v4-interview-ai`): collections `vagas`, `candidaturas`, `usuarios`, `logs`
- **Cloudflare R2:** vídeos (`{candidaturaId}/{perguntaId}.webm`), CVs (`{candidaturaId}/curriculo.pdf`), TTS (`tts/{vagaId}/{perguntaId}.wav`)
- `.env.local` e `.vercel` no `.gitignore` — não sobe pro git.

## API externa

Vagas podem ser criadas/consultadas por sistemas externos via `/api/integracoes/*`, autenticado por `x-api-key`:

```bash
# Criar vaga
curl -X POST https://v4-interview-ai.vercel.app/api/integracoes/vagas \
  -H "x-api-key: SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"cargo":"Dev Backend","senioridade":"Pleno","segmento":"Tech"}'

# Listar candidaturas de uma vaga
curl "https://v4-interview-ai.vercel.app/api/integracoes/candidaturas?vagaExternalId=xxx" \
  -H "x-api-key: SUA_CHAVE"
```

## Limitações conhecidas

- **Sem email notifications** — candidato e recrutador não recebem alertas por email.
- **Candidatura ID é o "auth" do candidato** — quem tem o UUID acessa tudo (dados, vídeo, CV, notas internas). Aceitável pra MVP, mas não pra produção com dados sensíveis.
- **Sem paginação** — listagens carregam todos os registros. OK com volume baixo.
- **ffmpeg não roda no Vercel** — extração de frames degrada graceful (retorna `[]`), detecção de teleprompter desativada.
- **Safari/iOS** pode gravar MP4 ao invés de WebM — backend aceita os dois.
- **OpenAPI spec** é hand-maintained e pode estar desatualizado.

## Próximos passos

- [ ] Rate limiting persistente (Upstash Redis)
- [ ] Notificações por email (Resend/SendGrid)
- [ ] Paginação nas listagens
- [ ] Upgrade pra Next.js 15.x
- [ ] Sentry completo (instalar @sentry/nextjs)
- [ ] Testes E2E com Playwright
- [ ] Candidate identity unification (dedup cross-vaga)
