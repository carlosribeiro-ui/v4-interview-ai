import type { Vaga, Candidatura } from './types';

const RECOMENDACAO_TEXTO: Record<string, string> = {
  avancar: 'Avançar no processo',
  analisar_com_cautela: 'Analisar com cautela',
  reprovar: 'Não avançar'
};

/** Gera CSV do parecer — uma linha por pergunta respondida, com os dados gerais do candidato repetidos em cada linha (mesmo conteúdo do PDF, em formato tabular). */
export function gerarParecerCsv(vaga: Vaga, candidatura: Candidatura): string {
  const parecer = candidatura.parecer;
  const score = candidatura.scoreMedio ?? 0;
  const escapar = (v: string) => `"${String(v).replace(/"/g, '""')}"`;

  const header = [
    'Nome',
    'Email',
    'Vaga',
    'Senioridade',
    'Score geral',
    'Recomendação',
    'Síntese executiva',
    'Conclusão',
    'Pergunta',
    'Resposta transcrita',
    'Nota',
    'Análise',
    'Pontos fortes',
    'Pontos de melhoria'
  ];

  const linhas = vaga.perguntas
    .map((pergunta) => {
      const resposta = candidatura.respostas.find((r) => r.perguntaId === pergunta.id);
      if (!resposta) return null;
      const analise = parecer?.porPergunta.find((p) => p.perguntaId === pergunta.id);
      return [
        candidatura.nome,
        candidatura.email,
        vaga.cargo,
        vaga.senioridade,
        score.toFixed(1),
        parecer ? (RECOMENDACAO_TEXTO[parecer.recomendacao] ?? parecer.recomendacao) : '',
        parecer?.sinteseExecutiva ?? '',
        parecer?.conclusao ?? '',
        pergunta.texto,
        resposta.transcricao || '',
        resposta.score.toFixed(1),
        analise?.analise ?? '',
        analise?.pontosFortes.join(' | ') ?? '',
        analise?.pontosMelhoria.join(' | ') ?? ''
      ]
        .map((v) => escapar(String(v)))
        .join(',');
    })
    .filter((l): l is string => l !== null);

  return '﻿' + [header.map(escapar).join(','), ...linhas].join('\n');
}
