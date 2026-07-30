import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { Vaga, Candidatura, Parecer } from './types';

const V4_RED = '#E50914';
const V4_RED_DARK = '#B20710';
const V4_GREEN = '#52CC5A';
const V4_YELLOW = '#E8B923';
const INK = '#1A1A1A';
const MUTED = '#6B6B6B';
const BORDER = '#E4E4E4';
const BG_SOFT = '#F7F7F7';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: INK, fontFamily: 'Helvetica' },

  capaWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 160 },
  capaTitulo: { fontSize: 22, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  capaSubtitulo: { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 6 },
  capaLinha: { width: 80, height: 2, backgroundColor: V4_RED, marginTop: 24, marginBottom: 24 },
  capaNome: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: V4_RED_DARK, textAlign: 'center' },
  capaScoreCirculo: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 8,
    borderColor: V4_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28
  },
  capaScoreNum: { fontSize: 26, fontFamily: 'Helvetica-Bold' },
  capaScoreLabel: { fontSize: 10, color: MUTED, marginTop: 10 },
  capaRodape: { position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', fontSize: 9, color: MUTED },

  headerNome: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  headerMeta: { fontSize: 9, color: MUTED, marginTop: 2 },

  card: { borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 14, marginTop: 16 },
  cardTituloRed: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: V4_RED_DARK, marginBottom: 8 },
  paragrafo: { fontSize: 10, lineHeight: 1.5, color: INK },

  perguntaTag: {
    alignSelf: 'flex-start',
    backgroundColor: V4_RED,
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 8
  },
  label: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: MUTED, marginBottom: 3, marginTop: 8 },
  respostaBox: { backgroundColor: BG_SOFT, borderRadius: 4, padding: 8 },
  respostaTexto: { fontSize: 9.5, lineHeight: 1.5, color: '#333333', fontStyle: 'italic' },

  analiseBox: {
    borderWidth: 1,
    borderColor: '#F3C9C9',
    backgroundColor: '#FDF2F2',
    borderRadius: 4,
    padding: 8,
    marginTop: 8
  },
  analiseTitulo: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: V4_RED_DARK, marginBottom: 3 },
  analiseTexto: { fontSize: 9.5, lineHeight: 1.5, color: '#4a1414', fontStyle: 'italic' },

  colunas: { flexDirection: 'row', gap: 10, marginTop: 8 },
  coluna: { flex: 1, borderRadius: 4, padding: 8 },
  colunaFortes: { backgroundColor: '#EAF7EB', borderWidth: 1, borderColor: '#CDEAD0' },
  colunaMelhoria: { backgroundColor: '#FDF6E3', borderWidth: 1, borderColor: '#F0DFA8' },
  colunaTituloFortes: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#2E7D32', marginBottom: 4 },
  colunaTituloMelhoria: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#9A6B00', marginBottom: 4 },
  bullet: { fontSize: 9, lineHeight: 1.4, marginBottom: 2 },

  conclusaoCard: { borderLeftWidth: 4, borderLeftColor: V4_RED, backgroundColor: BG_SOFT, borderRadius: 4, padding: 14, marginTop: 16 },
  recomendacaoTag: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 6 },

  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 8, color: MUTED, textAlign: 'center' }
});

const CORES_RECOMENDACAO: Record<Parecer['recomendacao'], { cor: string; texto: string }> = {
  avancar: { cor: V4_GREEN, texto: 'RECOMENDAÇÃO: AVANÇAR NO PROCESSO' },
  analisar_com_cautela: { cor: V4_YELLOW, texto: 'RECOMENDAÇÃO: ANALISAR COM CAUTELA' },
  reprovar: { cor: V4_RED, texto: 'RECOMENDAÇÃO: NÃO AVANÇAR' }
};

function ParecerDocumento({ vaga, candidatura }: { vaga: Vaga; candidatura: Candidatura }) {
  const parecer = candidatura.parecer!;
  const score = candidatura.scoreMedio ?? 0;
  const recomendacao = CORES_RECOMENDACAO[parecer.recomendacao];

  return (
    <Document title={`Parecer - ${candidatura.nome}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.capaWrap}>
          <Text style={styles.capaTitulo}>PARECER DE ENTREVISTA</Text>
          <Text style={styles.capaSubtitulo}>
            {vaga.cargo} ({vaga.senioridade}) · {vaga.segmento}
          </Text>
          <View style={styles.capaLinha} />
          <Text style={styles.capaNome}>{candidatura.nome}</Text>
          <View style={styles.capaScoreCirculo}>
            <Text style={styles.capaScoreNum}>{score.toFixed(1)}</Text>
          </View>
          <Text style={styles.capaScoreLabel}>Pontuação geral: {score.toFixed(1)}/10</Text>
        </View>
        <Text style={styles.capaRodape}>V4 Interview AI — parecer gerado por IA a partir da entrevista em vídeo</Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.headerNome}>{candidatura.nome}</Text>
        <Text style={styles.headerMeta}>
          {candidatura.email}
          {candidatura.telefone ? ` · ${candidatura.telefone}` : ''}
          {candidatura.linkedin ? ` · ${candidatura.linkedin}` : ''}
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTituloRed}>SÍNTESE EXECUTIVA</Text>
          <Text style={styles.paragrafo}>{parecer.sinteseExecutiva}</Text>
        </View>

        {vaga.perguntas.map((pergunta, i) => {
          const resposta = candidatura.respostas.find((r) => r.perguntaId === pergunta.id);
          const analise = parecer.porPergunta.find((p) => p.perguntaId === pergunta.id);
          if (!resposta) return null;
          return (
            <View key={pergunta.id} style={styles.card} wrap={false}>
              <Text style={styles.perguntaTag}>PERGUNTA {i + 1}</Text>
              <Text style={styles.label}>Pergunta</Text>
              <Text style={styles.paragrafo}>{pergunta.texto}</Text>

              <Text style={styles.label}>Resposta transcrita</Text>
              <View style={styles.respostaBox}>
                <Text style={styles.respostaTexto}>"{resposta.transcricao || '(sem transcrição)'}"</Text>
              </View>

              {analise && (
                <>
                  <View style={styles.analiseBox}>
                    <Text style={styles.analiseTitulo}>ANÁLISE:</Text>
                    <Text style={styles.analiseTexto}>{analise.analise}</Text>
                  </View>
                  <View style={styles.colunas}>
                    <View style={[styles.coluna, styles.colunaFortes]}>
                      <Text style={styles.colunaTituloFortes}>Pontos fortes</Text>
                      {analise.pontosFortes.map((p, j) => (
                        <Text key={j} style={styles.bullet}>
                          • {p}
                        </Text>
                      ))}
                    </View>
                    {analise.pontosMelhoria.length > 0 && (
                      <View style={[styles.coluna, styles.colunaMelhoria]}>
                        <Text style={styles.colunaTituloMelhoria}>Pontos de melhoria</Text>
                        {analise.pontosMelhoria.map((p, j) => (
                          <Text key={j} style={styles.bullet}>
                            • {p}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              )}

              <Text style={[styles.label, { marginTop: 8 }]}>
                Nota individual: <Text style={{ color: V4_RED_DARK }}>{resposta.score.toFixed(1)}/10</Text>
              </Text>
            </View>
          );
        })}

        <View style={styles.conclusaoCard} wrap={false}>
          <Text style={[styles.recomendacaoTag, { color: recomendacao.cor }]}>{recomendacao.texto}</Text>
          <Text style={styles.paragrafo}>{parecer.conclusao}</Text>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${vaga.perguntas.length} pergunta(s) avaliada(s) · Score: ${score.toFixed(1)}/10 · Gerado em ${new Date(
              parecer.geradoEm
            ).toLocaleDateString('pt-BR')} · Página ${pageNumber} de ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export async function gerarParecerPdfBuffer(vaga: Vaga, candidatura: Candidatura): Promise<Buffer> {
  return renderToBuffer(<ParecerDocumento vaga={vaga} candidatura={candidatura} />);
}
