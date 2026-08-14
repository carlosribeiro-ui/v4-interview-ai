'use client';

import { useEffect, useRef, useState } from 'react';
import type { Vaga, Candidatura } from '@/lib/types';
import { UFS, PAISES } from '@/lib/cidades-brasil';
import BuscaCidade from '@/app/components/BuscaCidade';
import {
  OPCOES_FORMACAO, OPCOES_IDIOMA, formatarTelefone, telefoneValido,
  linkedinValido, formatarMoedaBRL
} from '@/lib/form-candidato';

type Fase = 'carregando' | 'form' | 'idioma' | 'onboarding' | 'entrevista' | 'csat' | 'concluido' | 'erro';

const TEMPO_LEITURA_SEG = 20;
const TEMPO_MAX_RESPOSTA_SEG = 60;

/** Chave da sessao local do candidato — permite retomar apos recarregar/fechar o navegador. */
function chaveSessao(vagaId: string) {
  return `v4-interview:candidatura:${vagaId}`;
}

/** Primeira pergunta ainda sem resposta enviada. -1 = todas respondidas. */
function proximoIndice(vaga: Vaga, candidatura: Candidatura) {
  const respondidas = new Set(candidatura.respostas.map((r) => r.perguntaId));
  return vaga.perguntas.findIndex((p) => !respondidas.has(p.id));
}

/** Principais primeiro, adicionais (opcionais) por último — ordem em que o candidato responde. */
function ordenarPerguntas(vaga: Vaga): Vaga {
  const perguntas = [...vaga.perguntas].sort((a, b) => {
    const ta = a.tipo === 'adicional' ? 1 : 0;
    const tb = b.tipo === 'adicional' ? 1 : 0;
    return ta - tb;
  });
  return { ...vaga, perguntas };
}

export default function EntrevistaPage({ params }: { params: { vagaId: string } }) {
  const [vaga, setVaga] = useState<Vaga | null>(null);
  const [fase, setFase] = useState<Fase>('carregando');
  const [erro, setErro] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [telefone, setTelefone] = useState('');
  const [pretensaoSalarial, setPretensaoSalarial] = useState('');
  const [curriculo, setCurriculo] = useState<File | null>(null);
  const [segmento, setSegmento] = useState('');
  const [nivelProfissional, setNivelProfissional] = useState('');
  const [formacao, setFormacao] = useState('');
  const [pais, setPais] = useState('Brasil');
  const [estado, setEstado] = useState('');
  const [cidade, setCidade] = useState('');
  const [idioma, setIdioma] = useState('');
  const [candidaturaId, setCandidaturaId] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);
  const [retomado, setRetomado] = useState(false);
  const [falando, setFalando] = useState(false);
  const [carregandoAudio, setCarregandoAudio] = useState(false);
  const [ehTeste, setEhTeste] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setEhTeste(new URLSearchParams(window.location.search).get('teste') === '1');
    }
  }, []);

  function pararFala() {
    audioRef.current?.pause();
    audioRef.current = null;
    setFalando(false);
    setCarregandoAudio(false);
  }

  // Troca de pergunta: qualquer fala em andamento da pergunta anterior é interrompida.
  useEffect(() => {
    return () => pararFala();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice]);

  function tocarAudio(src: string) {
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onended = () => setFalando(false);
    audio.onerror = () => setFalando(false);
    setCarregandoAudio(false);
    setFalando(true);
    audio.play();
  }

  /**
   * Gera e toca o áudio da pergunta. SEMPRE chama a API pra validar que o áudio
   * corresponde ao texto atual — corrige bug de cache obsoleto quando admin edita
   * a pergunta ou teste gera áudio com texto diferente.
   */
  async function ouvirPergunta(pergunta: { id: string; texto: string; audioUrl?: string }) {
    if (falando || carregandoAudio) {
      pararFala();
      return;
    }
    setCarregandoAudio(true);
    try {
      const res = await fetch('/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: pergunta.texto, vagaId: params.vagaId, perguntaId: pergunta.id })
      });
      if (!res.ok) throw new Error('Falha ao gerar áudio');

      const contentType = res.headers.get('Content-Type') ?? '';
      if (contentType.includes('application/json')) {
        const { audioUrl } = await res.json();
        setVaga((atual) =>
          atual
            ? { ...atual, perguntas: atual.perguntas.map((p) => (p.id === pergunta.id ? { ...p, audioUrl } : p)) }
            : atual
        );
        tocarAudio(audioUrl);
      } else {
        const blob = await res.blob();
        tocarAudio(URL.createObjectURL(blob));
      }
    } catch {
      setCarregandoAudio(false);
      setFalando(false);
    }
  }

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      // Endpoint público — o candidato não está logado. GET /api/vagas/[id] (sem
      // /publica) exige sessão admin/talent de propósito, pois devolve as
      // candidaturas de todo mundo que já se aplicou pra essa vaga.
      const res = await fetch(`/api/vagas/${params.vagaId}/publica`);
      if (!res.ok) throw new Error('Vaga não encontrada');
      const data = await res.json();
      const vagaCarregada: Vaga = ordenarPerguntas(data.vaga);
      if (!ativo) return;
      setVaga(vagaCarregada);

      // Tenta retomar uma entrevista já iniciada nesta máquina.
      const salvo = localStorage.getItem(chaveSessao(params.vagaId));
      if (!salvo) {
        setFase('form');
        return;
      }

      const resCand = await fetch(`/candidaturas/${salvo}`);
      if (!resCand.ok) {
        // candidatura sumiu do servidor (data/ limpo): descarta a sessão órfã
        localStorage.removeItem(chaveSessao(params.vagaId));
        if (ativo) setFase('form');
        return;
      }

      const { candidatura }: { candidatura: Candidatura } = await resCand.json();
      if (!ativo) return;

      setNome(candidatura.nome);
      setEmail(candidatura.email);

      const prox = proximoIndice(vagaCarregada, candidatura);
      if (candidatura.status === 'concluida' || prox === -1) {
        localStorage.removeItem(chaveSessao(params.vagaId));
        if (candidatura.csat) {
          setFase('concluido');
        } else {
          setFase('csat');
        }
        return;
      }

      setCandidaturaId(candidatura.id);
      setIndice(prox);
      setRetomado(candidatura.respostas.length > 0);
      setFase('entrevista');
    }

    carregar().catch((e) => {
      if (!ativo) return;
      setErro(e.message);
      setFase('erro');
    });

    return () => {
      ativo = false;
    };
  }, [params.vagaId]);

  /** Valida os campos obrigatórios e avança pra escolha de idioma da entrevista antes de criar a candidatura. */
  function aoSubmeterForm(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!linkedinValido(linkedin)) {
      setErro('Informe um LinkedIn válido (link ou @usuário).');
      return;
    }
    if (!telefoneValido(telefone)) {
      setErro('Informe um telefone válido (mín. 8 dígitos).');
      return;
    }
    setFase('idioma');
  }

  async function criarCandidatura() {
    setErro('');
    const res = await fetch('/candidaturas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vagaId: params.vagaId, nome, email, linkedin, telefone, pretensaoSalarial, segmento, nivelProfissional, formacao, pais, estado, cidade, idioma })
    });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.error ?? 'Erro ao iniciar entrevista');
      return;
    }

    if (curriculo) {
      const formData = new FormData();
      formData.append('curriculo', curriculo);
      await fetch(`/candidaturas/${data.id}/curriculo`, { method: 'POST', body: formData }).catch(() => {});
    }

    localStorage.setItem(chaveSessao(params.vagaId), data.id);
    setCandidaturaId(data.id);

    // O servidor pode ter devolvido uma candidatura já em andamento (mesmo e-mail).
    const prox = vaga ? proximoIndice(vaga, data as Candidatura) : 0;
    if (prox === -1) {
      localStorage.removeItem(chaveSessao(params.vagaId));
      setFase('csat');
      return;
    }
    setIndice(prox === -1 ? 0 : prox);
    setRetomado(Boolean(data.retomada) && (data.respostas?.length ?? 0) > 0);
    setFase('onboarding');
  }

  async function aoEnviarResposta() {
    if (!vaga) return;
    setRetomado(false);
    if (indice + 1 < vaga.perguntas.length) {
      setIndice(indice + 1);
    } else {
      await fetch(`/candidaturas/${candidaturaId}/finalizar`, { method: 'POST' });
      localStorage.removeItem(chaveSessao(params.vagaId));
      setFase('csat');
    }
  }

  if (fase === 'carregando') return <p className="text-fg/50">Carregando…</p>;
  if (fase === 'erro') return <p className="text-v4red">{erro}</p>;
  if (!vaga) return null;

  if (fase === 'form') {
    return (
      <div className="max-w-md mx-auto bg-v4surface border border-fg/10 rounded p-6">
        <h1 className="font-heading text-xl font-bold mb-1">
          Entrevista — {vaga.cargo} ({vaga.senioridade})
        </h1>
        <p className="text-fg/50 text-sm mb-5">
          Você vai responder {vaga.perguntas.length} pergunta(s) em vídeo. Pode gravar quando estiver
          pronto. Se precisar parar, use o mesmo e-mail para retomar de onde parou.
        </p>
        <form onSubmit={aoSubmeterForm} className="space-y-3">
          <div>
            <label className="block text-sm text-fg/60 mb-1">Nome completo</label>
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 outline-none focus:border-v4red"
            />
          </div>
          <div>
            <label className="block text-sm text-fg/60 mb-1">E-mail</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 outline-none focus:border-v4red"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-fg/60 mb-1">LinkedIn</label>
              <input
                required
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="linkedin.com/in/..."
                className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 outline-none focus:border-v4red"
              />
            </div>
            <div>
              <label className="block text-sm text-fg/60 mb-1">Telefone</label>
              <input
                required
                inputMode="tel"
                maxLength={17}
                value={telefone}
                onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                placeholder="(11) 99999-9999"
                className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 outline-none focus:border-v4red"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-fg/60 mb-1">Pretensão salarial (opcional)</label>
            <input
              inputMode="numeric"
              value={pretensaoSalarial}
              onChange={(e) => setPretensaoSalarial(formatarMoedaBRL(e.target.value))}
              placeholder="R$ 0,00"
              className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 outline-none focus:border-v4red"
            />
          </div>

          {/* Dados adicionais para filtros avançados */}
          <div className="border-t border-fg/10 pt-4 mt-2">
            <p className="text-xs text-fg/40 uppercase tracking-wide mb-3">Dados adicionais (opcional — melhora os filtros)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-fg/50 mb-1">Segmento</label>
                <select value={segmento} onChange={(e) => setSegmento(e.target.value)} className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red">
                  <option value="">Selecione</option>
                  <option value="tecnologia">Tecnologia</option>
                  <option value="saude">Saúde</option>
                  <option value="educacao">Educação</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="varejo">Varejo</option>
                  <option value="industria">Indústria</option>
                  <option value="servicos">Serviços</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-fg/50 mb-1">Nível profissional</label>
                <select value={nivelProfissional} onChange={(e) => setNivelProfissional(e.target.value)} className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red">
                  <option value="">Selecione</option>
                  <option value="estagiario">Estagiário</option>
                  <option value="junior">Júnior</option>
                  <option value="pleno">Pleno</option>
                  <option value="senior">Sênior</option>
                  <option value="especialista">Especialista</option>
                  <option value="gerente">Gerente</option>
                  <option value="diretor">Diretor</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-fg/50 mb-1">Formação</label>
                <select value={formacao} onChange={(e) => setFormacao(e.target.value)} className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red">
                  <option value="">Selecione</option>
                  {OPCOES_FORMACAO.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-xs text-fg/50 mb-1">País</label>
                <select
                  value={pais}
                  onChange={(e) => {
                    setPais(e.target.value);
                    if (e.target.value !== 'Brasil') { setEstado(''); setCidade(''); }
                  }}
                  className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                >
                  {PAISES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-fg/50 mb-1">Estado</label>
                {pais === 'Brasil' ? (
                  <select
                    value={estado}
                    onChange={(e) => { setEstado(e.target.value); setCidade(''); }}
                    className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                  >
                    <option value="">Selecione</option>
                    {UFS.map((uf) => (
                      <option key={uf.sigla} value={uf.sigla}>{uf.sigla}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    placeholder="Ex: SP"
                    className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs text-fg/50 mb-1">Cidade</label>
                {pais === 'Brasil' && estado ? (
                  <BuscaCidade
                    uf={estado}
                    value={cidade}
                    onChange={setCidade}
                    placeholder="Digite para buscar…"
                  />
                ) : (
                  <input
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder={pais === 'Brasil' ? 'Selecione o estado' : 'Ex: São Paulo'}
                    disabled={pais === 'Brasil' && !estado}
                    className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red disabled:opacity-40"
                  />
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm text-fg/60 mb-1">Currículo em PDF (opcional)</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setCurriculo(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-fg/60 file:mr-3 file:rounded file:border-0 file:bg-fg/10 file:px-3 file:py-1.5 file:text-fg/70 hover:file:bg-fg/20"
            />
          </div>
          {erro && <p className="text-v4red text-sm">{erro}</p>}
          <button
            type="submit"
            className="w-full rounded bg-v4red hover:bg-v4redDark text-fg uppercase font-bold px-4 py-2"
          >
            Continuar
          </button>
        </form>
      </div>
    );
  }

  if (fase === 'idioma') {
    return (
      <EscolhaIdioma
        idioma={idioma}
        onEscolher={setIdioma}
        erro={erro}
        onConfirmar={criarCandidatura}
        onVoltar={() => setFase('form')}
      />
    );
  }

  if (fase === 'onboarding') {
    return <Onboarding onConcluir={() => setFase('entrevista')} />;
  }

  if (fase === 'concluido') {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center bg-v4surface border border-fg/10 rounded-2xl p-8">
          <h1 className="font-heading text-xl font-bold mb-2">Entrevista concluída!</h1>
          <p className="text-fg/60">
            Obrigado, {nome}. Suas respostas foram registradas e avaliadas.
          </p>
          {ehTeste && (
            <a
              href={`/vagas/${params.vagaId}`}
              className="inline-block mt-5 rounded-full bg-v4red hover:bg-v4redDark text-fg font-semibold px-5 py-2.5 text-sm transition"
            >
              Ver feedback da IA →
            </a>
          )}
        </div>
        {!ehTeste && <OutrasVagas vagaAtualId={params.vagaId} />}
      </div>
    );
  }

  if (fase === 'csat' && candidaturaId) {
    return <FormCSAT candidaturaId={candidaturaId} nome={nome} onConcluir={() => setFase('concluido')} />;
  }

  const pergunta = vaga.perguntas[indice];
  const principais = vaga.perguntas.filter((p) => (p.tipo ?? 'principal') === 'principal');
  const ehAdicional = (pergunta.tipo ?? 'principal') === 'adicional';
  const indiceAdicional = indice - principais.length;
  const totalAdicionais = vaga.perguntas.length - principais.length;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {retomado && (
        <div className="rounded border border-v4green/30 bg-v4green/10 px-4 py-3 text-sm text-v4green">
          Entrevista retomada — suas {indice} resposta(s) anteriores já foram salvas.
        </div>
      )}
      <p className="text-fg/40 text-sm">
        {ehAdicional
          ? `Pergunta adicional ${indiceAdicional + 1} de ${totalAdicionais} (opcional)`
          : `Pergunta ${indice + 1} de ${principais.length}`}
      </p>
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-heading text-lg font-semibold">{pergunta.texto}</h1>
        <button
          onClick={() => ouvirPergunta(pergunta)}
          disabled={carregandoAudio}
          className="shrink-0 rounded border border-fg/10 hover:bg-fg/10 text-fg/70 hover:text-fg px-3 py-1.5 text-sm whitespace-nowrap disabled:opacity-50"
        >
          {carregandoAudio ? '⏳ Gerando áudio…' : falando ? '⏸ Parar' : '🔊 Ouvir pergunta'}
        </button>
      </div>
      {ehAdicional && (
        <button
          onClick={aoEnviarResposta}
          className="text-sm text-fg/50 hover:text-fg/80 underline"
        >
          Pular esta pergunta (opcional) →
        </button>
      )}
      <Gravador
        key={pergunta.id}
        candidaturaId={candidaturaId!}
        perguntaId={pergunta.id}
        onEnviado={aoEnviarResposta}
      />
    </div>
  );
}

/**
 * Escolha do idioma da entrevista — separada do form de dados (que é sobre o
 * candidato), porque isso é sobre em qual idioma a IA vai conduzir as perguntas.
 * Fica logo antes do onboarding de câmera/mic, já no fim do fluxo pré-entrevista.
 */
function EscolhaIdioma({
  idioma, onEscolher, erro, onConfirmar, onVoltar
}: {
  idioma: string;
  onEscolher: (v: string) => void;
  erro: string;
  onConfirmar: () => Promise<void>;
  onVoltar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    try {
      await onConfirmar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-md mx-auto bg-v4surface border border-fg/10 rounded p-6">
      <h1 className="font-heading text-xl font-bold mb-1">Idioma da entrevista</h1>
      <p className="text-fg/50 text-sm mb-5">
        Em qual idioma você prefere responder as perguntas?
      </p>
      <div className="space-y-2">
        {OPCOES_IDIOMA.map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => onEscolher(val)}
            className={`w-full text-left rounded border px-4 py-2.5 transition ${
              idioma === val
                ? 'border-v4red bg-v4red/10 text-fg'
                : 'border-fg/10 bg-field/20 text-fg/70 hover:border-fg/30'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {erro && <p className="text-v4red text-sm mt-3">{erro}</p>}
      <div className="flex gap-2 mt-5">
        <button
          type="button"
          onClick={onVoltar}
          className="rounded border border-fg/10 text-fg/60 hover:text-fg px-4 py-2"
        >
          Voltar
        </button>
        <button
          type="button"
          disabled={!idioma || enviando}
          onClick={confirmar}
          className="flex-1 rounded bg-v4red hover:bg-v4redDark disabled:opacity-50 text-fg uppercase font-bold px-4 py-2"
        >
          {enviando ? 'Iniciando…' : 'Começar entrevista'}
        </button>
      </div>
    </div>
  );
}

/**
 * Única tela antes da entrevista: testa câmera/mic (único gesto que o navegador
 * exige) e segue sozinha assim que a permissão é concedida — sem telas
 * intermediárias pra clicar "Continuar".
 */
function Onboarding({ onConcluir }: { onConcluir: () => void }) {
  const avancouRef = useRef(false);

  function aoLiberarPermissao(ok: boolean) {
    if (!ok || avancouRef.current) return;
    avancouRef.current = true;
    setTimeout(onConcluir, 1200);
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-heading text-xl font-semibold mb-2">Antes de começar</h1>
      <p className="text-fg/50 text-sm mb-6">
        Procure um local silencioso e com boa iluminação. A entrevista começa automaticamente assim
        que sua câmera e microfone forem liberados — cada pergunta tem {TEMPO_LEITURA_SEG}s de
        leitura e a gravação inicia e é enviada sozinha.
      </p>

      <div className="rounded border border-fg/10 bg-v4surface p-6">
        <h2 className="text-center font-semibold text-fg/90 mb-5">Liberando câmera e microfone…</h2>
        <TesteCameraMicrofone onResultado={aoLiberarPermissao} />
      </div>
    </div>
  );
}

function TesteCameraMicrofone({ onResultado }: { onResultado: (ok: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>();
  const [estado, setEstado] = useState<'pedindo' | 'ok' | 'negado'>('pedindo');
  const [nivelAudio, setNivelAudio] = useState(0);

  function pararTudo() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
  }

  function testar() {
    setEstado('pedindo');
    onResultado(false);
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const dados = new Uint8Array(analyser.frequencyBinCount);

        function medir() {
          analyser.getByteFrequencyData(dados);
          const media = dados.reduce((a, b) => a + b, 0) / dados.length;
          setNivelAudio(Math.min(100, Math.round((media / 128) * 100)));
          rafRef.current = requestAnimationFrame(medir);
        }
        medir();

        setEstado('ok');
        onResultado(true);
      })
      .catch(() => {
        setEstado('negado');
        onResultado(false);
      });
  }

  useEffect(() => {
    testar();
    return () => pararTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full rounded bg-field aspect-video border border-fg/10"
      />

      {estado === 'pedindo' && (
        <p className="text-fg/60 text-sm text-center">
          Aguardando permissão do navegador para câmera e microfone…
        </p>
      )}

      {estado === 'ok' && (
        <div className="space-y-1">
          <p className="text-v4green text-sm text-center">✓ Câmera e microfone conectados</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg/50 shrink-0">🎙 Fale algo para testar</span>
            <div className="flex-1 h-2 rounded bg-fg/10 overflow-hidden">
              <div
                className="h-full bg-v4green transition-all"
                style={{ width: `${nivelAudio}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {estado === 'negado' && (
        <div className="space-y-2 text-center">
          <p className="text-v4red text-sm">
            Não foi possível acessar sua câmera/microfone. Verifique as permissões do navegador e
            tente novamente.
          </p>
          <button
            onClick={testar}
            className="rounded border border-fg/20 hover:bg-fg/10 text-fg/80 px-4 py-1.5 text-sm"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Fluxo 100% automático: sem botão de gravar, regravar ou upload manual — a
 * gravação começa sozinha ao fim da leitura e é enviada sozinha ao parar
 * (por tempo máximo ou pelo candidato encerrando a fala antes do limite).
 */
function Gravador({
  candidaturaId,
  perguntaId,
  onEnviado
}: {
  candidaturaId: string;
  perguntaId: string;
  onEnviado: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tokenGravacaoRef = useRef<string | null>(null);
  const [estado, setEstado] = useState<'preparando' | 'leitura' | 'gravando' | 'enviando' | 'erro'>(
    'preparando'
  );
  const [erro, setErro] = useState('');
  const [segundosLeitura, setSegundosLeitura] = useState(TEMPO_LEITURA_SEG);
  const [segundosResposta, setSegundosResposta] = useState(TEMPO_MAX_RESPOSTA_SEG);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  // V-SEC (sinal, não prova): conta quantas vezes a aba perdeu foco durante a gravação
  // e por quanto tempo — candidato pode ter saído pra ler uma cola em outra tela.
  const focoRef = useRef({ vezes: 0, segundosFora: 0, saiuEm: 0 });
  // Detecção de teleprompter/leitura (2026-08-14): captura frames DIRETO no navegador (canvas
  // sobre o <video> da própria webcam) em vez de extrair no servidor com ffmpeg — o Vercel
  // serverless não tem ffmpeg instalado, então lib/video.ts::extractarFrames() sempre retornava
  // [] em produção e a IA nunca via imagem nenhuma (avaliarResposta cai no fallback
  // estaLendo=false/confiancaLeitura=0 sem frames — ver lib/llm.ts). Capturando aqui, o frame
  // sempre existe, não depende de infraestrutura nenhuma no servidor.
  const framesTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const framesRef = useRef<{ frameBase64: string; timestamp: string }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function capturarFrame(timestamp: string) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // qualidade baixa (0.5) — é só pra IA ler expressão/olhar, não precisa de definição alta,
    // e mantém o upload leve (frames vão junto com o form do vídeo).
    const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
    const base64 = dataUrl.split(',')[1];
    if (base64) framesRef.current.push({ frameBase64: base64, timestamp });
  }

  // Avisa antes de sair/fechar a aba durante leitura/gravação/envio — o vídeo só é
  // enviado no onstop do MediaRecorder (ver enviar()); se o candidato fechar a aba
  // ou navegar pra fora antes disso, a gravação em memória (chunksRef) se perde e
  // NADA chega a ser salvo no back pra essa pergunta. Isso não impede 100% da perda
  // (fechar o navegador à força ignora o beforeunload), mas cobre o caso comum de
  // sair sem querer/voltar o navegador.
  useEffect(() => {
    if (estado !== 'leitura' && estado !== 'gravando' && estado !== 'enviando') return;
    function avisar(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [estado]);

  // Pede o token de gravação assim que a leitura começa (bem antes de precisar dele no
  // upload) — anti-fraude: prova que essa resposta passou pelo fluxo real da tela, não um
  // vídeo qualquer mandado direto pra API. Ver lib/auth-edge.ts (criarTokenGravacao).
  async function obterTokenGravacao() {
    try {
      const res = await fetch(`/candidaturas/${candidaturaId}/respostas/iniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perguntaId })
      });
      if (!res.ok) throw new Error();
      const { token } = await res.json();
      tokenGravacaoRef.current = token;
    } catch {
      // Sem token, o upload no fim vai ser rejeitado pelo servidor — erro fica claro lá.
      tokenGravacaoRef.current = null;
    }
  }

  async function enviar(blob: Blob) {
    setEstado('enviando');
    const formData = new FormData();
    formData.append('perguntaId', perguntaId);
    formData.append('video', blob, 'resposta.webm');
    formData.append('tokenGravacao', tokenGravacaoRef.current ?? '');
    formData.append('perdeuFoco', JSON.stringify({ vezes: focoRef.current.vezes, segundosFora: Math.round(focoRef.current.segundosFora) }));
    formData.append('frames', JSON.stringify(framesRef.current));
    const res = await fetch(`/candidaturas/${candidaturaId}/respostas`, {
      method: 'POST',
      body: formData
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (!res.ok) {
      // Vídeo já foi salvo no back mesmo se a avaliação falhar — segue o fluxo normalmente.
      onEnviado();
      return;
    }
    onEnviado();
  }

  function iniciarGravacao() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    focoRef.current = { vezes: 0, segundosFora: 0, saiuEm: 0 };
    framesRef.current = [];
    framesTimeoutsRef.current.forEach(clearTimeout);
    const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      enviar(new Blob(chunksRef.current, { type: 'video/webm' }));
    };
    recorderRef.current = recorder;
    recorder.start();
    setEstado('gravando');
    setSegundosResposta(TEMPO_MAX_RESPOSTA_SEG);
    stopTimeoutRef.current = setTimeout(() => {
      recorderRef.current?.stop();
    }, TEMPO_MAX_RESPOSTA_SEG * 1000);
    // 3 capturas espaçadas ao longo da resposta (início/meio/fim) — o candidato pode desviar
    // o olhar num instante só, então múltiplos pontos aumentam a chance de pegar o sinal sem
    // deixar o payload pesado (3 JPEGs em baixa qualidade).
    const pontos = [2, Math.floor(TEMPO_MAX_RESPOSTA_SEG / 2), Math.max(3, TEMPO_MAX_RESPOSTA_SEG - 3)];
    framesTimeoutsRef.current = pontos.map((seg) =>
      setTimeout(() => capturarFrame(`00:00:${String(seg).padStart(2, '0')}`), seg * 1000)
    );
  }

  useEffect(() => {
    let ativo = true;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!ativo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }
        obterTokenGravacao();
        setEstado('leitura');
      })
      .catch(() => {
        setErro('Não foi possível acessar câmera/microfone. Permita o acesso e recarregue a página.');
        setEstado('erro');
      });

    return () => {
      ativo = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      framesTimeoutsRef.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contagem regressiva de leitura: ao chegar em zero, a gravação começa sozinha.
  useEffect(() => {
    if (estado !== 'leitura') return;
    setSegundosLeitura(TEMPO_LEITURA_SEG);
    const intervalo = setInterval(() => {
      setSegundosLeitura((s) => {
        if (s <= 1) {
          clearInterval(intervalo);
          iniciarGravacao();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  // Cronômetro visual do tempo máximo de resposta (o corte de verdade é o setTimeout do iniciarGravacao).
  useEffect(() => {
    if (estado !== 'gravando') return;
    const intervalo = setInterval(() => {
      setSegundosResposta((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(intervalo);
  }, [estado]);

  // Tracking de "saída da tela" durante a gravação (feedback de call, 2026-08-14): troca de
  // aba/janela é um sinal de que o candidato pode ter ido ler uma cola em outro lugar. Só
  // conta enquanto 'gravando' — sair durante a leitura da pergunta é normal/esperado.
  useEffect(() => {
    if (estado !== 'gravando') return;
    function aoPerderFoco() {
      if (focoRef.current.saiuEm) return; // já contando, ignora repetição do mesmo evento
      focoRef.current.vezes += 1;
      focoRef.current.saiuEm = Date.now();
    }
    function aoRecuperarFoco() {
      if (!focoRef.current.saiuEm) return;
      focoRef.current.segundosFora += (Date.now() - focoRef.current.saiuEm) / 1000;
      focoRef.current.saiuEm = 0;
    }
    function aoMudarVisibilidade() {
      if (document.hidden) aoPerderFoco();
      else aoRecuperarFoco();
    }
    window.addEventListener('blur', aoPerderFoco);
    window.addEventListener('focus', aoRecuperarFoco);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      window.removeEventListener('blur', aoPerderFoco);
      window.removeEventListener('focus', aoRecuperarFoco);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      aoRecuperarFoco(); // fecha qualquer janela de ausência aberta ao trocar de estado
    };
  }, [estado]);

  function encerrarResposta() {
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    framesTimeoutsRef.current.forEach(clearTimeout);
    // Se o candidato encerrar antes do último ponto agendado, captura um frame na hora —
    // melhor um frame "fim antecipado" do que nenhum frame do fim da resposta.
    capturarFrame('encerramento-antecipado');
    recorderRef.current?.stop();
  }

  return (
    <div className="space-y-3">
      <video ref={videoRef} autoPlay playsInline className="w-full rounded bg-field aspect-video" />
      {/* Oculto — só usado como buffer pra capturarFrame() desenhar o <video> e virar JPEG. */}
      <canvas ref={canvasRef} className="hidden" />
      {erro && <p className="text-v4red text-sm">{erro}</p>}

      {estado === 'leitura' && (
        <div className="rounded border border-fg/10 bg-v4surface px-4 py-3 text-sm text-fg/70 flex items-center justify-between">
          <span>📖 Leia a pergunta com atenção — a gravação começa sozinha</span>
          <span className="font-mono text-v4red font-bold">{segundosLeitura}s</span>
        </div>
      )}

      <div className="flex gap-2 items-center">
        {estado === 'gravando' && (
          <>
            <span className="flex items-center gap-2 rounded bg-v4redDeep text-fg uppercase font-bold px-4 py-2 animate-pulse">
              ● Gravando
            </span>
            <span className="font-mono text-fg/50 text-sm">
              {String(Math.floor(segundosResposta / 60)).padStart(2, '0')}:
              {String(segundosResposta % 60).padStart(2, '0')} restantes
            </span>
            <button
              onClick={encerrarResposta}
              className="rounded border border-fg/20 hover:bg-fg/10 text-fg/80 px-4 py-2 text-sm"
            >
              Já terminei de responder →
            </button>
          </>
        )}
        {estado === 'enviando' && (
          <span className="text-fg/60 px-4 py-2">Processando (transcrevendo e avaliando)…</span>
        )}
        {estado === 'preparando' && <span className="text-fg/40 px-4 py-2">Preparando câmera…</span>}
      </div>
    </div>
  );
}

type VagaPublica = { id: string; cargo: string; senioridade: string; segmento: string };

const ORDEM_SENIORIDADE = ['Estágio', 'Júnior', 'Pleno', 'Sênior', 'Especialista'];

function ordenarPorSenioridade(a: string, b: string) {
  const ia = ORDEM_SENIORIDADE.indexOf(a);
  const ib = ORDEM_SENIORIDADE.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

/** Grupo de filtro em pills (single-select), usado 3x abaixo (área/cargo/senioridade). */
function GrupoFiltro({
  label,
  opcoes,
  valor,
  onEscolher
}: {
  label: string;
  opcoes: string[];
  valor: string;
  onEscolher: (v: string) => void;
}) {
  if (opcoes.length <= 1) return null;
  return (
    <div className="mb-3">
      <p className="text-[11px] text-fg/40 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onEscolher('')}
          className={`text-xs px-3 py-1.5 rounded-full transition ${
            valor === '' ? 'bg-v4red text-fg font-medium' : 'bg-fg/[0.06] text-fg/60 hover:bg-fg/10'
          }`}
        >
          Todas
        </button>
        {opcoes.map((o) => (
          <button
            key={o}
            onClick={() => onEscolher(o)}
            className={`text-xs px-3 py-1.5 rounded-full transition ${
              valor === o ? 'bg-v4red text-fg font-medium' : 'bg-fg/[0.06] text-fg/60 hover:bg-fg/10'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Convite pra outra entrevista, mostrado ao final — filtrável por área, cargo e senioridade. */
function OutrasVagas({ vagaAtualId }: { vagaAtualId: string }) {
  const [vagas, setVagas] = useState<VagaPublica[] | null>(null);
  const [area, setArea] = useState('');
  const [cargo, setCargo] = useState('');
  const [senioridade, setSenioridade] = useState('');

  useEffect(() => {
    fetch('/api/vagas/publicas')
      .then((r) => r.json())
      .then((data: VagaPublica[]) => setVagas(data.filter((v) => v.id !== vagaAtualId)))
      .catch(() => setVagas([]));
  }, [vagaAtualId]);

  if (!vagas || vagas.length === 0) return null;

  const areas = Array.from(new Set(vagas.map((v) => v.segmento))).sort();
  // "Cargo" aqui é o tipo de vaga (ex: "Analista de RH"), independente da senioridade —
  // é o que o usuário quer dizer com "Analista de RH é um tipo de vaga, com jr/pleno/sênior".
  const cargos = Array.from(new Set(vagas.map((v) => v.cargo))).sort();
  const senioridades = Array.from(new Set(vagas.map((v) => v.senioridade))).sort(ordenarPorSenioridade);

  const filtradas = vagas.filter(
    (v) => (!area || v.segmento === area) && (!cargo || v.cargo === cargo) && (!senioridade || v.senioridade === senioridade)
  );

  return (
    <div className="bg-v4surface border border-fg/10 rounded-2xl p-6 v4-fade-in">
      <h2 className="font-heading text-lg font-semibold mb-1">Gostaria de fazer outra entrevista?</h2>
      <p className="text-fg/50 text-sm mb-4">
        Temos outras vagas abertas — dá pra se candidatar a quantas quiser.
      </p>

      <GrupoFiltro label="Área" opcoes={areas} valor={area} onEscolher={setArea} />
      <GrupoFiltro label="Vaga" opcoes={cargos} valor={cargo} onEscolher={setCargo} />
      <GrupoFiltro label="Senioridade" opcoes={senioridades} valor={senioridade} onEscolher={setSenioridade} />

      <div className="space-y-2 mt-4">
        {filtradas.length === 0 && (
          <p className="text-fg/40 text-sm">Nenhuma vaga encontrada com esses filtros.</p>
        )}
        {filtradas.map((v) => (
          <a
            key={v.id}
            href={`/entrevista/${v.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-fg/10 bg-field/20 hover:bg-field/30 hover:border-fg/20 px-4 py-3 transition"
          >
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">
                {v.cargo} <span className="text-fg/40 font-normal">· {v.senioridade}</span>
              </div>
              <div className="text-xs text-fg/40 truncate">{v.segmento}</div>
            </div>
            <span className="shrink-0 text-v4red text-sm font-semibold">Começar →</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Formulário de CSAT — avalição da experiência do candidato com a plataforma. */
function FormCSAT({ candidaturaId, nome, onConcluir }: { candidaturaId: string; nome: string; onConcluir: () => void }) {
  const [notas, setNotas] = useState({ facilidadeUso: 0, claridadePerguntas: 0, qualidadeAudio: 0, experienciaGeral: 0, recomendaria: 0 });
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);

  const perguntas: { key: keyof typeof notas; label: string; desc: string }[] = [
    { key: 'facilidadeUso', label: 'Facilidade de uso', desc: 'A plataforma foi fácil de navegar e usar?' },
    { key: 'claridadePerguntas', label: 'Clareza das perguntas', desc: 'As perguntas estavam claras e bem formuladas?' },
    { key: 'qualidadeAudio', label: 'Qualidade do áudio', desc: 'A funcionalidade "Ouvir pergunta" funcionou bem?' },
    { key: 'experienciaGeral', label: 'Experiência geral', desc: 'Como foi sua experiência com a entrevista?' },
    { key: 'recomendaria', label: 'Recomendaria', desc: 'Você recomendaria essa experiência para um colega?' }
  ];

  const preenchidas = Object.values(notas).filter((n) => n > 0).length;
  const todasPreenchidas = preenchidas === 5;

  async function enviar() {
    if (!todasPreenchidas) return;
    setEnviando(true);
    setErro('');
    try {
      const res = await fetch(`/candidaturas/${candidaturaId}/csat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...notas, comentario })
      });
      if (!res.ok) throw new Error('Erro ao salvar');
      setEnviado(true);
      setTimeout(onConcluir, 1500);
    } catch (err: any) {
      setErro(err.message ?? 'Erro ao salvar');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="max-w-xl mx-auto text-center bg-v4surface border border-fg/10 rounded-2xl p-8 v4-fade-in">
        <div className="text-4xl mb-3">🎉</div>
        <h1 className="font-heading text-xl font-bold mb-2">Obrigado!</h1>
        <p className="text-fg/60">Sua avaliação nos ajuda a melhorar a plataforma.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 v4-fade-in">
      <div className="text-center bg-v4surface border border-fg/10 rounded-2xl p-6">
        <h1 className="font-heading text-xl font-bold mb-1">Última etapa, {nome}!</h1>
        <p className="text-fg/50 text-sm">Avalie sua experiência com a plataforma (leva 30 segundos).</p>
      </div>

      <div className="space-y-5">
        {perguntas.map((p) => (
          <div key={p.key} className="bg-v4surface border border-fg/10 rounded-xl p-4">
            <p className="font-medium text-sm mb-1">{p.label}</p>
            <p className="text-xs text-fg/40 mb-3">{p.desc}</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setNotas((atual) => ({ ...atual, [p.key]: n }))}
                  className={`w-10 h-10 rounded-lg font-bold text-sm transition ${
                    notas[p.key] === n
                      ? 'bg-v4red text-fg'
                      : notas[p.key] > n
                        ? 'bg-v4red/20 text-v4red'
                        : 'bg-v4surface text-fg/40 hover:bg-fg/10'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {notas[p.key] > 0 && (
              <p className="text-[10px] text-fg/30 mt-1">
                {notas[p.key] === 1 && 'Péssimo'}
                {notas[p.key] === 2 && 'Ruim'}
                {notas[p.key] === 3 && 'Regular'}
                {notas[p.key] === 4 && 'Bom'}
                {notas[p.key] === 5 && 'Excelente'}
              </p>
            )}
          </div>
        ))}

        <div className="bg-v4surface border border-fg/10 rounded-xl p-4">
          <p className="font-medium text-sm mb-2">Comentário opcional</p>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            placeholder="Algum feedback adicional sobre sua experiência?"
            className="w-full rounded-lg bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red resize-none"
          />
        </div>
      </div>

      {erro && <p className="text-v4red text-sm text-center">{erro}</p>}

      <div className="flex gap-3">
        <button
          onClick={onConcluir}
          className="flex-1 rounded-full border border-fg/10 text-fg/50 hover:text-fg/80 py-3 text-sm transition"
        >
          Pular
        </button>
        <button
          onClick={enviar}
          disabled={!todasPreenchidas || enviando}
          className="flex-1 rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-fg font-semibold py-3 text-sm transition"
        >
          {enviando ? 'Enviando…' : `Enviar (${preenchidas}/5)`}
        </button>
      </div>
    </div>
  );
}
