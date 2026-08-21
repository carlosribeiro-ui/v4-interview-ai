/** OpenAPI 3.0 spec — hand-maintained. Atualizado para v0.4.0 (Bearer é o ÚNICO formato aceito nas Integracoes — x-api-key removido em 21/08/2026). */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const spec = {
  openapi: '3.0.3',
  info: {
    title: 'V4 Interview AI — API',
    version: '0.4.0',
    description:
      'Rotas /integracoes/* aceitam apenas `Authorization: Bearer <EXTERNAL_API_KEY>` (padrão RFC 6750). ' +
      'O formato legado `x-api-key` foi removido — integradores que ainda o usem recebem 401.'
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Auth' }, { name: 'Vagas' }, { name: 'Candidaturas' },
    { name: 'Candidatos' }, { name: 'Dashboard' }, { name: 'Relatorios' },
    { name: 'TTS' }, { name: 'Usuarios' }, { name: 'Integracoes' }
  ],
  components: {
    securitySchemes: {
      SessionAuth: { type: 'apiKey', in: 'cookie', name: 'v4_session' },
      BearerAuth: { type: 'http', scheme: 'bearer', description: 'Authorization: Bearer <EXTERNAL_API_KEY> — único formato aceito em /integracoes/*' }
    },
    schemas: {
      Erro: { type: 'object', properties: { error: { type: 'string' } } },
      Vaga: { type: 'object', properties: { id: { type: 'string' }, cargo: { type: 'string' }, senioridade: { type: 'string' }, segmento: { type: 'string' }, jobDescription: { type: 'string' }, ativa: { type: 'boolean' }, createdAt: { type: 'string' } } },
      Candidatura: { type: 'object', properties: { id: { type: 'string' }, vagaId: { type: 'string' }, nome: { type: 'string' }, email: { type: 'string' }, status: { type: 'string' }, fase: { type: 'string' }, scoreMedio: { type: 'number' }, talentResponsavel: { type: 'string' }, createdAt: { type: 'string' } } },
      Resposta: { type: 'object', properties: { perguntaId: { type: 'string' }, videoPath: { type: 'string' }, transcricao: { type: 'string' }, score: { type: 'number' }, feedback: { type: 'string' }, avaliando: { type: 'boolean' } } },
      Usuario: { type: 'object', properties: { id: { type: 'string' }, nome: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } } }
    }
  },
  paths: {
    '/auth/login': { post: { tags: ['Auth'], summary: 'Login', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'senha'], properties: { email: { type: 'string' }, senha: { type: 'string' } } } } } }, responses: { '200': { description: 'OK' } } } },
    '/auth/logout': { post: { tags: ['Auth'], summary: 'Logout', responses: { '200': { description: 'OK' } } } },
    '/auth/me': { get: { tags: ['Auth'], summary: 'Usuario atual', responses: { '200': { description: 'OK' }, '401': { description: 'Nao autenticado' } } } },
    '/api/vagas': {
      get: { tags: ['Vagas'], summary: 'Lista todas as vagas', responses: { '200': { description: 'OK' } } },
      post: { tags: ['Vagas'], summary: 'Cria vaga (admin/talent)', security: [{ SessionAuth: [] }], responses: { '201': { description: 'Criada' } } }
    },
    '/api/vagas/publicas': { get: { tags: ['Vagas'], summary: 'Vagas ativas (publico)', responses: { '200': { description: 'OK' } } } },
    '/api/vagas/{id}': {
      get: { tags: ['Vagas'], summary: 'Detalhe vaga + candidaturas', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
      patch: { tags: ['Vagas'], summary: 'Edita vaga (admin)', security: [{ SessionAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
      delete: { tags: ['Vagas'], summary: 'Remove vaga (admin)', security: [{ SessionAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
    },
    '/api/vagas/{id}/fases': { patch: { tags: ['Vagas'], summary: 'Gerencia fases (admin)', security: [{ SessionAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/candidaturas': { post: { tags: ['Candidaturas'], summary: 'Cria ou retoma candidatura', responses: { '201': { description: 'Criada' } } } },
    '/candidaturas/{id}': {
      get: { tags: ['Candidaturas'], summary: 'Detalhe candidatura', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
      patch: { tags: ['Candidaturas'], summary: 'Atualiza candidatura (+ talentResponsavel)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
      delete: { tags: ['Candidaturas'], summary: 'Remove candidatura (admin)', security: [{ SessionAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
    },
    '/candidaturas/{id}/respostas': {
      post: { tags: ['Candidaturas'], summary: 'Upload video (202 async)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '202': { description: 'Processando' } } },
      get: { tags: ['Candidaturas'], summary: 'Polling status resposta', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'perguntaId', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
    },
    '/candidaturas/{id}/finalizar': { post: { tags: ['Candidaturas'], summary: 'Finaliza entrevista', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/candidaturas/{id}/curriculo': { post: { tags: ['Candidaturas'], summary: 'Upload curriculo PDF', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'OK' } } } },
    '/candidaturas/{id}/parecer': { get: { tags: ['Candidaturas'], summary: 'Gera parecer IA (+ ?formato=csv|pdf)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/candidaturas/{id}/notas': { post: { tags: ['Candidaturas'], summary: 'Adiciona nota interna', security: [{ SessionAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'OK' } } } },
    '/candidaturas/{id}/fase': { patch: { tags: ['Candidaturas'], summary: 'Move candidato de fase', security: [{ SessionAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/api/candidatos': { get: { tags: ['Candidatos'], summary: 'Kanban global com filtros (+ ?formato=csv|pdf)', responses: { '200': { description: 'OK' } } } },
    '/api/dashboard': { get: { tags: ['Dashboard'], summary: 'Metricas real-time (+ ?formato=csv|pdf)', responses: { '200': { description: 'OK' } } } },
    '/api/relatorios': { get: { tags: ['Relatorios'], summary: 'Analise profunda com filtros (+ ?formato=csv|pdf)', responses: { '200': { description: 'OK' } } } },
    '/tts': { post: { tags: ['TTS'], summary: 'Gera audio via Gemini TTS', responses: { '200': { description: 'OK' } } } },
    '/usuarios': {
      get: { tags: ['Usuarios'], summary: 'Lista usuarios (admin)', security: [{ SessionAuth: [] }], responses: { '200': { description: 'OK' } } },
      post: { tags: ['Usuarios'], summary: 'Cria usuario (admin)', security: [{ SessionAuth: [] }], responses: { '201': { description: 'Criado' } } }
    },
    '/usuarios/{id}': { delete: { tags: ['Usuarios'], summary: 'Remove usuario (admin)', security: [{ SessionAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/logs': { get: { tags: ['Logs'], summary: 'Auditoria (admin) (+ ?formato=csv|pdf)', security: [{ SessionAuth: [] }], responses: { '200': { description: 'OK' } } } },
    '/integracoes/vagas': { get: { tags: ['Integracoes'], summary: 'Lista vagas (externo)', security: [{ BearerAuth: [] }], responses: { '200': { description: 'OK' } } }, post: { tags: ['Integracoes'], summary: 'Cria vaga (externo)', security: [{ BearerAuth: [] }], responses: { '201': { description: 'OK' } } } },
    '/integracoes/vagas/{id}': { get: { tags: ['Integracoes'], summary: 'Detalhe vaga (externo)', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/integracoes/candidaturas': { get: { tags: ['Integracoes'], summary: 'Lista candidaturas (externo)', security: [{ BearerAuth: [] }], responses: { '200': { description: 'OK' } } } },
    '/integracoes/candidaturas/{id}': { get: { tags: ['Integracoes'], summary: 'Detalhe candidatura (externo)', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/integracoes/export': { get: { tags: ['Integracoes'], summary: 'Export completo (externo)', security: [{ BearerAuth: [] }], responses: { '200': { description: 'OK' } } } }
  }
};

export const openApiSpec = spec;
