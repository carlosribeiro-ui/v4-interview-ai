/**
 * Spec OpenAPI 3.0 mantida à mão (sem geração automática a partir dos route.ts).
 * Servida em /api/openapi.json e renderizada em /docs (swagger-ui-react).
 * Atualize aqui sempre que uma rota de app/api/** mudar de forma.
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'V4 Interview AI — API',
    version: '0.1.0',
    description:
      'Entrevistas assíncronas em vídeo avaliadas por IA. As rotas /api/integracoes/* são para uso externo (autenticadas por x-api-key); as demais são as usadas pelo painel admin local, hoje sem autenticação.'
  },
  servers: [{ url: '/', description: 'Instância local' }],
  tags: [
    { name: 'Integrações', description: 'API pública para sistemas externos (n8n, Pipefy etc.) — requer x-api-key' },
    { name: 'Vagas', description: 'CRUD de vagas (uso do painel admin)' },
    { name: 'Candidaturas', description: 'Ciclo de vida da candidatura (uso do painel admin e da tela do candidato)' },
    { name: 'Dashboard', description: 'Estatísticas agregadas' }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Chave configurada em EXTERNAL_API_KEY (.env.local)'
      }
    },
    schemas: {
      Pergunta: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          texto: { type: 'string' },
          criterios: { type: 'string' }
        }
      },
      FaseDef: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nome: { type: 'string' },
          cor: { type: 'string', enum: ['neutro', 'atencao', 'sucesso', 'perigo'] }
        }
      },
      Vaga: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          cargo: { type: 'string' },
          senioridade: { type: 'string' },
          segmento: { type: 'string' },
          requisitos: { type: 'array', items: { type: 'string' } },
          perguntas: { type: 'array', items: { $ref: '#/components/schemas/Pergunta' } },
          fases: { type: 'array', items: { $ref: '#/components/schemas/FaseDef' } },
          createdAt: { type: 'string', format: 'date-time' },
          externalId: { type: 'string', nullable: true },
          origem: { type: 'string', nullable: true }
        }
      },
      VagaResumoExterno: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          externalId: { type: 'string', nullable: true },
          origem: { type: 'string', nullable: true },
          cargo: { type: 'string' },
          senioridade: { type: 'string' },
          segmento: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          linkCandidato: { type: 'string' },
          totalCandidatos: { type: 'integer' },
          concluidos: { type: 'integer' },
          scoreMedio: { type: 'number', nullable: true }
        }
      },
      Resposta: {
        type: 'object',
        properties: {
          perguntaId: { type: 'string' },
          videoPath: { type: 'string' },
          transcricao: { type: 'string' },
          score: { type: 'number' },
          feedback: { type: 'string' },
          estaLendo: { type: 'boolean', nullable: true },
          confiancaLeitura: { type: 'number', nullable: true }
        }
      },
      NotaInterna: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          texto: { type: 'string' },
          criadoEm: { type: 'string', format: 'date-time' }
        }
      },
      Candidatura: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          vagaId: { type: 'string' },
          nome: { type: 'string' },
          email: { type: 'string' },
          status: { type: 'string', enum: ['em_andamento', 'concluida'] },
          fase: { type: 'string' },
          respostas: { type: 'array', items: { $ref: '#/components/schemas/Resposta' } },
          scoreMedio: { type: 'number', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          linkedin: { type: 'string', nullable: true },
          telefone: { type: 'string', nullable: true },
          pretensaoSalarial: { type: 'string', nullable: true },
          curriculoPath: { type: 'string', nullable: true },
          notasInternas: { type: 'array', items: { $ref: '#/components/schemas/NotaInterna' } }
        }
      },
      CandidaturaResumoExterno: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          vagaId: { type: 'string' },
          nome: { type: 'string' },
          email: { type: 'string' },
          status: { type: 'string', enum: ['em_andamento', 'concluida'] },
          fase: { type: 'string' },
          scoreMedio: { type: 'number', nullable: true },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Erro: {
        type: 'object',
        properties: { error: { type: 'string' } }
      }
    }
  },
  paths: {
    '/api/integracoes/vagas': {
      get: {
        tags: ['Integrações'],
        summary: 'Lista vagas (uso externo)',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: 'externalId',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Filtra pela vaga cujo externalId bate com este valor'
          }
        ],
        responses: {
          '200': {
            description: 'Lista de vagas',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/VagaResumoExterno' } } } }
          },
          '401': { description: 'x-api-key ausente ou inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          '500': { description: 'EXTERNAL_API_KEY não configurada no servidor', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      },
      post: {
        tags: ['Integrações'],
        summary: 'Cria vaga (uso externo) — gera roteiro via IA',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cargo', 'senioridade', 'segmento'],
                properties: {
                  cargo: { type: 'string' },
                  senioridade: { type: 'string' },
                  segmento: { type: 'string' },
                  externalId: { type: 'string', description: 'ID de correlação no sistema externo (ex: card do Pipefy)' },
                  origem: { type: 'string', description: 'Nome do sistema externo, ex: "pipefy"' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Vaga criada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Vaga' } } } },
          '400': { description: 'Campos obrigatórios ausentes', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          '401': { description: 'x-api-key ausente ou inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/integracoes/candidaturas': {
      get: {
        tags: ['Integrações'],
        summary: 'Consulta status/fase das candidaturas (uso externo, somente leitura)',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: 'vagaId', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'vagaExternalId', in: 'query', required: false, schema: { type: 'string' } }
        ],
        responses: {
          '200': {
            description: 'Lista de candidaturas',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/CandidaturaResumoExterno' } } } }
          },
          '401': { description: 'x-api-key ausente ou inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          '404': { description: 'Vaga não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/vagas': {
      get: {
        tags: ['Vagas'],
        summary: 'Lista todas as vagas',
        responses: { '200': { description: 'Lista de vagas', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Vaga' } } } } } }
      },
      post: {
        tags: ['Vagas'],
        summary: 'Cria vaga (painel admin) — gera roteiro via IA',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cargo', 'senioridade', 'segmento'],
                properties: { cargo: { type: 'string' }, senioridade: { type: 'string' }, segmento: { type: 'string' } }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Vaga criada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Vaga' } } } },
          '400': { description: 'Campos obrigatórios ausentes', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/vagas/{id}': {
      get: {
        tags: ['Vagas'],
        summary: 'Detalhe da vaga + candidaturas ordenadas por score',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Vaga e candidaturas',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { vaga: { $ref: '#/components/schemas/Vaga' }, candidaturas: { type: 'array', items: { $ref: '#/components/schemas/Candidatura' } } } }
              }
            }
          },
          '404': { description: 'Vaga não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      },
      patch: {
        tags: ['Vagas'],
        summary: 'Edita requisitos, perguntas ou dados básicos da vaga',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  requisitos: { type: 'array', items: { type: 'string' } },
                  perguntas: { type: 'array', items: { $ref: '#/components/schemas/Pergunta' } },
                  cargo: { type: 'string' },
                  senioridade: { type: 'string' },
                  segmento: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Vaga atualizada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Vaga' } } } },
          '404': { description: 'Vaga não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/vagas/{id}/fases': {
      patch: {
        tags: ['Vagas'],
        summary: 'Substitui a lista de fases (colunas do kanban) da vaga',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['fases'], properties: { fases: { type: 'array', items: { $ref: '#/components/schemas/FaseDef' } } } }
            }
          }
        },
        responses: {
          '200': { description: 'Fases atualizadas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Vaga' } } } },
          '400': { description: 'Lista inválida (vazia, ids duplicados ou cor fora do enum)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          '404': { description: 'Vaga não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          '409': { description: 'Fase removida ainda tem candidatos — mova-os antes de excluir', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/candidaturas': {
      post: {
        tags: ['Candidaturas'],
        summary: 'Cria ou retoma a candidatura de um e-mail numa vaga (idempotente)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['vagaId', 'nome', 'email'],
                properties: {
                  vagaId: { type: 'string' },
                  nome: { type: 'string' },
                  email: { type: 'string' },
                  linkedin: { type: 'string', description: 'Opcional' },
                  telefone: { type: 'string', description: 'Opcional' },
                  pretensaoSalarial: { type: 'string', description: 'Opcional' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Candidatura criada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Candidatura' } } } },
          '200': { description: 'Candidatura em andamento retomada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Candidatura' } } } },
          '404': { description: 'Vaga não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          '409': { description: 'Entrevista já concluída com este e-mail', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/candidaturas/{id}': {
      get: {
        tags: ['Candidaturas'],
        summary: 'Detalhe de uma candidatura',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Candidatura', content: { 'application/json': { schema: { type: 'object', properties: { candidatura: { $ref: '#/components/schemas/Candidatura' } } } } } },
          '404': { description: 'Candidatura não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/candidaturas/{id}/fase': {
      patch: {
        tags: ['Candidaturas'],
        summary: 'Move o candidato para outra fase do pipeline da vaga',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['fase'], properties: { fase: { type: 'string', description: 'Um dos FaseDef.id da vaga da candidatura' } } } } }
        },
        responses: {
          '200': { description: 'Candidatura atualizada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Candidatura' } } } },
          '400': { description: 'fase não existe nas fases da vaga', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          '404': { description: 'Candidatura ou vaga não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/candidaturas/{id}/respostas': {
      post: {
        tags: ['Candidaturas'],
        summary: 'Envia a resposta em vídeo de uma pergunta (multipart) — dispara transcrição + avaliação por IA',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { type: 'object', required: ['perguntaId', 'video'], properties: { perguntaId: { type: 'string' }, video: { type: 'string', format: 'binary' } } }
            }
          }
        },
        responses: {
          '200': { description: 'Resposta avaliada e salva', content: { 'application/json': { schema: { $ref: '#/components/schemas/Candidatura' } } } },
          '400': { description: 'Campos ausentes', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          '404': { description: 'Candidatura não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/candidaturas/{id}/finalizar': {
      post: {
        tags: ['Candidaturas'],
        summary: 'Marca a candidatura como concluída',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Candidatura finalizada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Candidatura' } } } },
          '404': { description: 'Candidatura não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/candidaturas/{id}/curriculo': {
      post: {
        tags: ['Candidaturas'],
        summary: 'Envia o currículo do candidato (PDF, multipart)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', required: ['curriculo'], properties: { curriculo: { type: 'string', format: 'binary' } } } } }
        },
        responses: {
          '201': { description: 'Currículo salvo', content: { 'application/json': { schema: { $ref: '#/components/schemas/Candidatura' } } } },
          '400': { description: 'Arquivo ausente ou não é PDF', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          '404': { description: 'Candidatura não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/candidaturas/{id}/notas': {
      post: {
        tags: ['Candidaturas'],
        summary: 'Adiciona uma nota interna do recrutador (nunca visível ao candidato)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['texto'], properties: { texto: { type: 'string' } } } } }
        },
        responses: {
          '201': { description: 'Nota adicionada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Candidatura' } } } },
          '400': { description: 'texto ausente', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          '404': { description: 'Candidatura não encontrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } }
        }
      }
    },
    '/api/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Estatísticas agregadas de todas as vagas',
        responses: { '200': { description: 'Totais e resumo por vaga' } }
      }
    }
  }
};
