import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const V4_RED = '#E50914';
const V4_RED_DARK = '#B20710';
const INK = '#1A1A1A';
const MUTED = '#6B6B6B';
const BORDER = '#E4E4E4';
const BG_SOFT = '#F7F7F7';

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, color: INK, fontFamily: 'Helvetica' },
  header: { marginBottom: 10 },
  titulo: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: V4_RED_DARK },
  subtitulo: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  linhaSep: { height: 2, backgroundColor: V4_RED, marginTop: 8, marginBottom: 10, width: 50 },
  linhaCabecalho: { flexDirection: 'row', backgroundColor: V4_RED, borderRadius: 3, paddingVertical: 5, paddingHorizontal: 6 },
  celulaCabecalho: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#FFFFFF' },
  linha: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  linhaZebra: { backgroundColor: BG_SOFT },
  celula: { fontSize: 7.5, color: INK },
  footer: { position: 'absolute', bottom: 16, left: 28, right: 28, fontSize: 7, color: MUTED, textAlign: 'center' },
  vazio: { fontSize: 9, color: MUTED, marginTop: 20, textAlign: 'center' }
});

export type ColunaTabela = { chave: string; titulo: string; largura?: number };

function TabelaDocumento({
  titulo,
  subtitulo,
  colunas,
  linhas
}: {
  titulo: string;
  subtitulo?: string;
  colunas: ColunaTabela[];
  linhas: Record<string, string>[];
}) {
  return (
    <Document title={titulo}>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        {/* `fixed` repete cabeçalho (título + colunas) em toda página */}
        <View style={styles.header} fixed>
          <Text style={styles.titulo}>{titulo}</Text>
          {subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
          <View style={styles.linhaSep} />
          <View style={styles.linhaCabecalho}>
            {colunas.map((col) => (
              <Text key={col.chave} style={[styles.celulaCabecalho, { flex: col.largura ?? 1 }]}>
                {col.titulo}
              </Text>
            ))}
          </View>
        </View>

        {linhas.length === 0 && <Text style={styles.vazio}>Nenhum registro encontrado.</Text>}

        {linhas.map((linha, i) => (
          <View key={i} style={i % 2 === 1 ? [styles.linha, styles.linhaZebra] : styles.linha} wrap={false}>
            {colunas.map((col) => (
              <Text key={col.chave} style={[styles.celula, { flex: col.largura ?? 1 }]}>
                {linha[col.chave] ?? ''}
              </Text>
            ))}
          </View>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `V4 Interview AI · ${linhas.length} registro(s) · Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

/** Gera um PDF de tabela genérico (cabeçalho V4 repetido em toda página, zebra striping). Usado por todos os exports tabulares (candidatos, relatórios, dashboard, logs). */
export async function gerarTabelaPdfBuffer(opts: {
  titulo: string;
  subtitulo?: string;
  colunas: ColunaTabela[];
  linhas: Record<string, string>[];
}): Promise<Buffer> {
  return renderToBuffer(<TabelaDocumento {...opts} />);
}
