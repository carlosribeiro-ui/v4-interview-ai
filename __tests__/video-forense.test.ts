import { describe, it, expect } from 'vitest';
import { analisarIntegridadeVideo } from '@/lib/video-forense';

/**
 * Constrói um WebM mínimo mas estruturalmente válido: EBML header + Segment > Info >
 * {TimecodeScale, Duration}. É o formato que um arquivo REMUXADO/editado tem — gravação ao
 * vivo do MediaRecorder não declara Duration, e é justamente essa diferença que o parser usa.
 */
function webmComDuracao(segundos: number): Buffer {
  const escala = 1_000_000; // 1ms em nanossegundos (default do Matroska)
  const duracaoBruta = (segundos * 1e9) / escala;

  // Duration: ID 0x4489, tamanho 8 (0x88), double big-endian
  const duration = Buffer.alloc(11);
  duration[0] = 0x44;
  duration[1] = 0x89;
  duration[2] = 0x88;
  duration.writeDoubleBE(duracaoBruta, 3);

  // TimecodeScale: ID 0x2AD7B1, tamanho 3 (0x83), valor 1000000 = 0x0F4240
  const timecodeScale = Buffer.from([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]);

  const infoConteudo = Buffer.concat([timecodeScale, duration]);
  const info = Buffer.concat([
    Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x80 | infoConteudo.length]),
    infoConteudo
  ]);
  const segment = Buffer.concat([Buffer.from([0x18, 0x53, 0x80, 0x67, 0x80 | info.length]), info]);

  // EBML header (magic bytes reais) — o parser deve pular por cima dele e achar o Segment.
  const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x00, 0x00, 0x00, 0x00]);
  return Buffer.concat([ebmlHeader, segment]);
}

/** WebM "ao vivo": header EBML sem Segment/Info com Duration — como o MediaRecorder produz. */
function webmSemDuracao(): Buffer {
  return Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x00, 0x00, 0x00, 0x00]);
}

describe('analisarIntegridadeVideo', () => {
  it('não acusa nada numa gravação ao vivo normal (WebM sem duração declarada)', () => {
    const sinais = analisarIntegridadeVideo(webmSemDuracao(), true, 45_000);
    expect(sinais).toHaveLength(0);
  });

  it('acusa WebM que declara duração — só um remux/editor escreve esse campo', () => {
    const sinais = analisarIntegridadeVideo(webmComDuracao(30), true, 60_000);
    const codigos = sinais.map((s) => s.codigo);
    expect(codigos).toContain('metadados_de_edicao');
  });

  it('acusa contradição física: vídeo mais longo que a janela de tempo disponível', () => {
    // 120s de vídeo, mas só 40s se passaram desde que a pergunta foi aberta — impossível.
    const sinais = analisarIntegridadeVideo(webmComDuracao(120), true, 40_000);
    const codigos = sinais.map((s) => s.codigo);
    expect(codigos).toContain('duracao_excede_janela');
    expect(sinais.find((s) => s.codigo === 'duracao_excede_janela')?.peso).toBe('alto');
  });

  it('não acusa duração quando ela cabe na janela (margem de tolerância)', () => {
    const sinais = analisarIntegridadeVideo(webmComDuracao(50), true, 60_000);
    expect(sinais.map((s) => s.codigo)).not.toContain('duracao_excede_janela');
  });

  it('acusa container MP4 — o gravador da tela sempre produz WebM', () => {
    const mp4Falso = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypisom'),
      Buffer.alloc(64)
    ]);
    const sinais = analisarIntegridadeVideo(mp4Falso, false, 60_000);
    expect(sinais.map((s) => s.codigo)).toContain('container_inesperado');
  });

  it('lida com arquivo truncado/corrompido sem lançar exceção', () => {
    expect(() => analisarIntegridadeVideo(Buffer.from([0x1a, 0x45]), true, 10_000)).not.toThrow();
    expect(() => analisarIntegridadeVideo(Buffer.alloc(0), true, 10_000)).not.toThrow();
  });
});
