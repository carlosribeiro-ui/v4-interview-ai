'use client';

import { useState } from 'react';
import { useToast } from '@/app/components/Toast';
import { UFS, PAISES } from '@/lib/cidades-brasil';
import BuscaCidade from '@/app/components/BuscaCidade';

/* ─── Constantes ─── */

const SEGMENTOS = [
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'varejo', label: 'Varejo' },
  { value: 'industria', label: 'Indústria' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'rh', label: 'Recrutamento e seleção (RH tech)' },
  { value: 'outro', label: 'Outro' }
];

const NIVEIS = [
  { value: 'Estágio', label: 'Estágio' },
  { value: 'Júnior', label: 'Júnior' },
  { value: 'Pleno', label: 'Pleno' },
  { value: 'Sênior', label: 'Sênior' },
  { value: 'Especialista', label: 'Especialista' },
  { value: 'Gerente', label: 'Gerente' },
  { value: 'Diretor', label: 'Diretor' }
];

const FORMACOES = [
  { value: '', label: 'Não exigido' },
  { value: 'Ensino Médio', label: 'Ensino Médio' },
  { value: 'Técnico', label: 'Técnico' },
  { value: 'Superior', label: 'Superior' },
  { value: 'Pós-graduação', label: 'Pós-graduação' },
  { value: 'Mestrado', label: 'Mestrado' },
  { value: 'Doutorado', label: 'Doutorado' }
];

const IDIOMAS = [
  { value: 'Português', label: 'Português' },
  { value: 'Inglês', label: 'Inglês' },
  { value: 'Espanhol', label: 'Espanhol' },
  { value: 'Francês', label: 'Francês' },
  { value: 'Alemão', label: 'Alemão' },
  { value: 'Outro', label: 'Outro' }
];

const NUMERO_PERGUNTAS_OPTIONS = [5, 7, 10, 12, 15];

const STEP_LABELS = ['Informações', 'Detalhes', 'Perguntas', 'Notificações', 'Configurações'];

type StepField = {
  label: string;
  text: string;
};

/* ─── Componente principal ─── */

export default function NovaVagaWizard({ onCriar }: { onCriar: (data: any) => Promise<void> }) {
  const { mostrar, ToastContainer } = useToast();
  const [step, setStep] = useState(0);
  const [enviando, setEnviando] = useState(false);

  // Step 1 — Informações
  const [identificador, setIdentificador] = useState('');
  const [cargo, setCargo] = useState('');
  const [segmento, setSegmento] = useState('');
  const [senioridade, setSenioridade] = useState('Pleno');
  const [formacaoAcademica, setFormacaoAcademica] = useState('');
  const [pais, setPais] = useState('Brasil');
  const [estado, setEstado] = useState('');
  const [cidade, setCidade] = useState('');
  const [idiomaEntrevista, setIdiomaEntrevista] = useState('Português');
  const [avaliarIdioma, setAvaliarIdioma] = useState(false);

  // Step 2 — Detalhes
  const [jobDescription, setJobDescription] = useState('');
  const [responsabilidades, setResponsabilidades] = useState('');
  const [requisitos, setRequisitos] = useState('');
  const [gerandoDescricao, setGerandoDescricao] = useState(false);

  // Step 3 — Perguntas
  const [numeroPerguntas, setNumeroPerguntas] = useState(7);
  const [perguntas, setPerguntas] = useState<StepField[]>([]);
  const [gerandoPerguntas, setGerandoPerguntas] = useState(false);
  const [gerandoPerguntaIdx, setGerandoPerguntaIdx] = useState<number | null>(null);

  // Step 4 — Notificações
  const [mensagemRejeicao, setMensagemRejeicao] = useState('');
  const [notifAtiva, setNotifAtiva] = useState(false);

  // Step 5 — Configurações
  const [dataFechamento, setDataFechamento] = useState('');
  const [numeroEntrevistas, setNumeroEntrevistas] = useState('');
  const [vagaPrivada, setVagaPrivada] = useState(false);
  const [prioritaria, setPrioritaria] = useState(false);
  const [msgBoasVindas, setMsgBoasVindas] = useState('');
  const [msgAgradecimento, setMsgAgradecimento] = useState('');
  const [boasVindasAtiva, setBoasVindasAtiva] = useState(false);
  const [agradecimentoAtivo, setAgradecimentoAtivo] = useState(false);

  /* ─── Validação ─── */

  function validarStep0(): boolean {
    if (!cargo.trim()) { mostrar('Informe o título da entrevista (cargo).', 'erro'); return false; }
    if (!segmento) { mostrar('Selecione o segmento de atividade.', 'erro'); return false; }
    return true;
  }

  function validarStep1(): boolean {
    const reqLines = requisitos.split('\n').map((s) => s.trim()).filter(Boolean);
    if (reqLines.length === 0) { mostrar('Informe pelo menos um requisito.', 'erro'); return false; }
    return true;
  }

  function validarStep2(): boolean {
    if (perguntas.length === 0) { mostrar('Adicione pelo menos uma pergunta.', 'erro'); return false; }
    const vazias = perguntas.filter((p) => !p.text.trim());
    if (vazias.length > 0) { mostrar(`Existem ${vazias.length} pergunta(s) vazia(s). Preencha ou remova.`, 'erro'); return false; }
    return true;
  }

  /* ─── IA — Gerar descrição (step 2) ─── */

  async function gerarDescricao() {
    setGerandoDescricao(true);
    try {
      const res = await fetch('/api/vagas/gerar-descricao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cargo, senioridade, segmento, formacaoAcademica, idiomaEntrevista, pais, estado, cidade })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar descrição');
      if (data.jobDescription) setJobDescription(data.jobDescription);
      if (data.responsabilidades) setResponsabilidades(data.responsabilidades);
      if (data.requisitos?.length) setRequisitos(data.requisitos.join('\n'));
      mostrar('Descrição gerada com sucesso!', 'sucesso');
    } catch (err: any) {
      mostrar(err.message ?? 'Erro ao gerar descrição', 'erro');
    } finally {
      setGerandoDescricao(false);
    }
  }

  /* ─── IA — Gerar todas as perguntas (step 3) ─── */

  async function gerarTodasPerguntas() {
    const reqLines = requisitos.split('\n').map((s) => s.trim()).filter(Boolean);
    if (reqLines.length === 0) { mostrar('Preencha os requisitos antes de gerar perguntas.', 'erro'); return; }
    setGerandoPerguntas(true);
    try {
      const res = await fetch('/api/vagas/gerar-perguntas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cargo, senioridade, segmento, jobDescription, responsabilidades,
          requisitos: reqLines, numeroPerguntas
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar perguntas');
      if (data.perguntas?.length) {
        setPerguntas(data.perguntas.map((p: any) => ({ label: p.texto, text: p.criterios ? `${p.texto}\n[critérios] ${p.criterios}` : p.texto })));
        mostrar(`${data.perguntas.length} perguntas geradas!`, 'sucesso');
      }
    } catch (err: any) {
      mostrar(err.message ?? 'Erro ao gerar perguntas', 'erro');
    } finally {
      setGerandoPerguntas(false);
    }
  }

  /* ─── IA — Gerar uma pergunta individual ─── */

  async function gerarUmaPergunta(idx: number) {
    const reqLines = requisitos.split('\n').map((s) => s.trim()).filter(Boolean);
    if (reqLines.length === 0) { mostrar('Preencha os requisitos antes de gerar.', 'erro'); return; }
    setGerandoPerguntaIdx(idx);
    try {
      const res = await fetch('/api/vagas/gerar-perguntas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cargo, senioridade, segmento, jobDescription, responsabilidades,
          requisitos: reqLines, numeroPerguntas: 1
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar pergunta');
      if (data.perguntas?.[0]) {
        const p = data.perguntas[0];
        setPerguntas((prev) => prev.map((q, i) => i === idx ? { ...q, text: p.criterios ? `${p.texto}\n[critérios] ${p.criterios}` : p.texto } : q));
        mostrar('Pergunta gerada!', 'sucesso');
      }
    } catch (err: any) {
      mostrar(err.message ?? 'Erro ao gerar pergunta', 'erro');
    } finally {
      setGerandoPerguntaIdx(null);
    }
  }

  /* ─── Navegação ─── */

  function avancar() {
    if (step === 0 && !validarStep0()) return;
    if (step === 1 && !validarStep1()) return;
    if (step === 2 && !validarStep2()) return;
    if (step < 4) setStep(step + 1);
  }

  function voltar() {
    if (step > 0) setStep(step - 1);
  }

  async function finalizar() {
    if (!validarStep2()) { setStep(2); return; }
    setEnviando(true);
    try {
      const reqLines = requisitos.split('\n').map((s) => s.trim()).filter(Boolean);
      const perguntasParsed = perguntas.map((p) => {
        const lines = p.text.split('\n');
        const texto = lines[0] || p.text;
        const criterioLine = lines.find((l) => l.startsWith('[critérios]'));
        const criterios = criterioLine ? criterioLine.replace('[critérios]', '').trim() : '';
        return {
          texto,
          criterios: criterios || 'Avaliar com base nos requisitos da vaga, clareza, profundidade e adequação ao nível.',
          tipo: 'principal' as const
        };
      });

      await onCriar({
        cargo, senioridade, segmento, jobDescription, responsabilidades,
        requisitos: reqLines, perguntas: perguntasParsed,
        identificador, formacaoAcademica, pais, estado, cidade,
        idiomaEntrevista, avaliarIdioma, numeroPerguntas,
        dataFechamento: dataFechamento || undefined,
        numeroEntrevistas: numeroEntrevistas ? Number(numeroEntrevistas) : undefined,
        vagaPrivada, prioritaria,
        mensagemRejeicao: notifAtiva ? mensagemRejeicao : undefined,
        mensagemBoasVindas: boasVindasAtiva ? msgBoasVindas : undefined,
        mensagemAgradecimento: agradecimentoAtivo ? msgAgradecimento : undefined
      });
    } catch (err: any) {
      mostrar(err.message ?? 'Erro ao criar vaga', 'erro');
    } finally {
      setEnviando(false);
    }
  }

  /* ─── Render ─── */

  return (
    <div className="max-w-5xl mx-auto">
      {ToastContainer}

      {/* Stepper */}
      <div className="flex items-center gap-1 mb-8">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-1 flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                i < step
                  ? 'bg-v4green text-black'
                  : i === step
                  ? 'bg-v4green text-black'
                  : 'bg-white/10 text-white/40'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs whitespace-nowrap ${i === step ? 'text-white font-medium' : 'text-white/40'}`}>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${i < step ? 'bg-v4green' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Conteúdo principal */}
        <div className="flex-1 min-w-0">
          <div className="bg-v4surface border border-v4border rounded-2xl p-6 shadow-card">
            {/* Step 0 — Informações */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-heading text-xl font-bold mb-1">Informações da entrevista</h2>
                  <p className="text-white/50 text-sm">Preencha os dados básicos para criar sua entrevista</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Identificador</label>
                    <input
                      value={identificador}
                      onChange={(e) => setIdentificador(e.target.value)}
                      placeholder="Ex: DEV-2025-01"
                      className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Título da entrevista *</label>
                    <input
                      required
                      value={cargo}
                      onChange={(e) => setCargo(e.target.value)}
                      placeholder="Ex: Desenvolvedor Full Stack"
                      className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Segmento da atividade econômica *</label>
                    <select
                      value={segmento}
                      onChange={(e) => setSegmento(e.target.value)}
                      className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    >
                      <option value="">Selecione segmento</option>
                      {SEGMENTOS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Nível profissional *</label>
                    <select
                      value={senioridade}
                      onChange={(e) => setSenioridade(e.target.value)}
                      className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    >
                      {NIVEIS.map((n) => (
                        <option key={n.value} value={n.value}>{n.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Formação acadêmica</label>
                    <select
                      value={formacaoAcademica}
                      onChange={(e) => setFormacaoAcademica(e.target.value)}
                      className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    >
                      {FORMACOES.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">País</label>
                    <select
                      value={pais}
                      onChange={(e) => {
                        setPais(e.target.value);
                        if (e.target.value !== 'Brasil') { setEstado(''); setCidade(''); }
                      }}
                      className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    >
                      {PAISES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Estado</label>
                    {pais === 'Brasil' ? (
                      <select
                        value={estado}
                        onChange={(e) => { setEstado(e.target.value); setCidade(''); }}
                        className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                      >
                        <option value="">Selecione o estado</option>
                        {UFS.map((uf) => (
                          <option key={uf.sigla} value={uf.sigla}>{uf.sigla} — {uf.nome}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={estado}
                        onChange={(e) => setEstado(e.target.value)}
                        placeholder="Ex: SP"
                        className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Cidade</label>
                    {pais === 'Brasil' && estado ? (
                      <BuscaCidade
                        uf={estado}
                        value={cidade}
                        onChange={setCidade}
                        placeholder="Digite para buscar a cidade…"
                      />
                    ) : (
                      <input
                        value={cidade}
                        onChange={(e) => setCidade(e.target.value)}
                        placeholder={pais === 'Brasil' ? 'Selecione o estado primeiro' : 'Ex: São Paulo'}
                        disabled={pais === 'Brasil' && !estado}
                        className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red disabled:opacity-40"
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Idioma da entrevista</label>
                    <select
                      value={idiomaEntrevista}
                      onChange={(e) => setIdiomaEntrevista(e.target.value)}
                      className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    >
                      {IDIOMAS.map((i) => (
                        <option key={i.value} value={i.value}>{i.label}</option>
                      ))}
                    </select>
                    <p className="text-white/30 text-xs mt-1">
                      Define o idioma em que a entrevista será conduzida — perguntas, avaliação e feedbacks gerados.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <button
                      type="button"
                      onClick={() => setAvaliarIdioma(!avaliarIdioma)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        avaliarIdioma ? 'bg-v4green' : 'bg-white/20'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        avaliarIdioma ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                    <div>
                      <div className="text-sm">Avaliar proficiência no idioma</div>
                      <div className="text-white/40 text-xs">Avalia gramática e fluência nas respostas</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1 — Detalhes */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-heading text-xl font-bold mb-1">Detalhes da entrevista</h2>
                  <p className="text-white/50 text-sm">Descreva as responsabilidades e requisitos da posição</p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={gerarDescricao}
                    disabled={gerandoDescricao}
                    className="flex items-center gap-2 rounded-full border border-v4green/30 text-v4green hover:bg-v4green/10 px-4 py-2 text-sm transition disabled:opacity-50"
                  >
                    {gerandoDescricao ? (
                      <>⏳ Gerando…</>
                    ) : (
                      <>✨ Gerar nova descrição</>
                    )}
                  </button>
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-1">Descrição da Vaga</label>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    rows={6}
                    maxLength={3000}
                    placeholder="Descreva a vaga de forma clara e objetiva…"
                    className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                  />
                  <div className="text-right text-white/30 text-xs">{jobDescription.length}/3000</div>
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-1">Responsabilidades</label>
                  <textarea
                    value={responsabilidades}
                    onChange={(e) => setResponsabilidades(e.target.value)}
                    rows={6}
                    maxLength={3000}
                    placeholder="Detalhe as responsabilidades diárias do cargo…"
                    className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                  />
                  <div className="text-right text-white/30 text-xs">{responsabilidades.length}/3000</div>
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-1">Requisitos</label>
                  <textarea
                    value={requisitos}
                    onChange={(e) => setRequisitos(e.target.value)}
                    rows={6}
                    maxLength={3000}
                    placeholder={'Um requisito por linha. Ex:\nDomínio de Node.js e TypeScript\nExperiência com APIs REST\nComunicação clara'}
                    className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                  />
                  <div className="text-right text-white/30 text-xs">{requisitos.length}/3000</div>
                </div>
              </div>
            )}

            {/* Step 2 — Perguntas */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-heading text-xl font-bold mb-1">Perguntas da Entrevista</h2>
                  <p className="text-white/50 text-sm">Configure as perguntas que serão feitas aos candidatos</p>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Número de perguntas</label>
                    <select
                      value={numeroPerguntas}
                      onChange={(e) => setNumeroPerguntas(Number(e.target.value))}
                      className="rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    >
                      {NUMERO_PERGUNTAS_OPTIONS.map((n) => (
                        <option key={n} value={n}>{n} perguntas</option>
                      ))}
                    </select>
                  </div>
                  <div className="pt-5">
                    <button
                      type="button"
                      onClick={async () => {
                        // Fill array with empty slots if needed
                        if (perguntas.length < numeroPerguntas) {
                          const novas = Array.from({ length: numeroPerguntas }, (_, i) =>
                            perguntas[i] || { label: `Pergunta ${i + 1}`, text: '' }
                          );
                          setPerguntas(novas);
                        }
                        await gerarTodasPerguntas();
                      }}
                      disabled={gerandoPerguntas}
                      className="flex items-center gap-2 rounded-full border border-v4green/30 text-v4green hover:bg-v4green/10 px-4 py-2 text-sm transition disabled:opacity-50"
                    >
                      {gerandoPerguntas ? (
                        <>⏳ Gerando…</>
                      ) : (
                        <>✨ Gerar perguntas</>
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-white/40 text-xs">
                  Clique em &quot;Gerar perguntas&quot; para que a IA crie as perguntas pra você
                </p>

                <div className="space-y-4">
                  {Array.from({ length: numeroPerguntas }, (_, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-white/70">Pergunta {i + 1}</label>
                        <button
                          type="button"
                          onClick={() => {
                            if (perguntas.length < numeroPerguntas) {
                              const novas = Array.from({ length: numeroPerguntas }, (_, j) =>
                                perguntas[j] || { label: `Pergunta ${j + 1}`, text: '' }
                              );
                              setPerguntas(novas);
                            }
                            gerarUmaPergunta(i);
                          }}
                          disabled={gerandoPerguntaIdx === i}
                          className="flex items-center gap-1 text-v4green/70 hover:text-v4green text-xs transition disabled:opacity-50"
                        >
                          {gerandoPerguntaIdx === i ? '⏳' : '✨'} Gerar pergunta
                        </button>
                      </div>
                      <textarea
                        value={perguntas[i]?.text || ''}
                        onChange={(e) => {
                          setPerguntas((prev) => {
                            const novas = [...prev];
                            while (novas.length <= i) novas.push({ label: '', text: '' });
                            novas[i] = { ...novas[i], text: e.target.value };
                            return novas;
                          });
                        }}
                        rows={3}
                        maxLength={500}
                        placeholder="Digite a pergunta…"
                        className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3 — Notificações */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-heading text-xl font-bold mb-1">Configurações de Notificação</h2>
                  <p className="text-white/50 text-sm">Personalize as mensagens enviadas aos candidatos</p>
                </div>

                <div className="bg-black/20 rounded-xl border border-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Mensagem de rejeição por e-mail</div>
                      <div className="text-white/40 text-xs">Configure o modelo de mensagem para candidaturas rejeitadas</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotifAtiva(!notifAtiva)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        notifAtiva ? 'bg-v4green' : 'bg-white/20'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        notifAtiva ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  {notifAtiva && (
                    <textarea
                      value={mensagemRejeicao}
                      onChange={(e) => setMensagemRejeicao(e.target.value)}
                      rows={4}
                      placeholder="Prezado(a), agradecemos seu interesse… Infelizmente, não seguaremos com sua candidatura…"
                      className="w-full mt-3 rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Step 4 — Configurações */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-heading text-xl font-bold mb-1">Configurações Adicionais</h2>
                  <p className="text-white/50 text-sm">Ajuste as configurações finais da sua entrevista</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Data de fechamento</label>
                    <input
                      type="date"
                      value={dataFechamento}
                      onChange={(e) => setDataFechamento(e.target.value)}
                      className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Número de entrevistas</label>
                    <input
                      type="number"
                      value={numeroEntrevistas}
                      onChange={(e) => setNumeroEntrevistas(e.target.value)}
                      placeholder="0 = ilimitado"
                      min={0}
                      className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    />
                  </div>
                </div>

                {/* Toggle: Vaga Privada */}
                <div className="bg-black/20 rounded-xl border border-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Vaga Privada</div>
                      <div className="text-white/40 text-xs">Vaga visível no banco público de vagas</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVagaPrivada(!vagaPrivada)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        vagaPrivada ? 'bg-v4green' : 'bg-white/20'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        vagaPrivada ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>

                {/* Toggle: Prioritária */}
                <div className="bg-black/20 rounded-xl border border-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Vaga com Prioridade</div>
                      <div className="text-white/40 text-xs">Esta vaga será listada na ordem padrão</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrioritaria(!prioritaria)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        prioritaria ? 'bg-v4green' : 'bg-white/20'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        prioritaria ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>

                {/* Toggle: Boas-vindas */}
                <div className="bg-black/20 rounded-xl border border-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Mensagem de boas-vindas</div>
                      <div className="text-white/40 text-xs">Configure a mensagem exibida ao iniciar a entrevista</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBoasVindasAtiva(!boasVindasAtiva)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        boasVindasAtiva ? 'bg-v4green' : 'bg-white/20'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        boasVindasAtiva ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  {boasVindasAtiva && (
                    <textarea
                      value={msgBoasVindas}
                      onChange={(e) => setMsgBoasVindas(e.target.value)}
                      rows={3}
                      placeholder="Olá! Bem-vindo(a) à entrevista…"
                      className="w-full mt-3 rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    />
                  )}
                </div>

                {/* Toggle: Agradecimento */}
                <div className="bg-black/20 rounded-xl border border-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Mensagem de agradecimento</div>
                      <div className="text-white/40 text-xs">Configure a mensagem exibida ao finalizar a entrevista</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAgradecimentoAtivo(!agradecimentoAtivo)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        agradecimentoAtivo ? 'bg-v4green' : 'bg-white/20'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        agradecimentoAtivo ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  {agradecimentoAtivo && (
                    <textarea
                      value={msgAgradecimento}
                      onChange={(e) => setMsgAgradecimento(e.target.value)}
                      rows={3}
                      placeholder="Obrigado por participar da entrevista…"
                      className="w-full mt-3 rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Navegação */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={voltar}
                  className="rounded-full border border-white/20 text-white/70 hover:text-white px-5 py-2.5 text-sm transition"
                >
                  Voltar
                </button>
              ) : <div />}

              {step < 4 ? (
                <button
                  type="button"
                  onClick={avancar}
                  className="rounded-full bg-v4green hover:bg-v4green/90 text-black font-semibold px-6 py-2.5 text-sm transition"
                >
                  Continuar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finalizar}
                  disabled={enviando}
                  className="rounded-full bg-v4green hover:bg-v4green/90 disabled:opacity-50 text-black font-semibold px-6 py-2.5 text-sm transition"
                >
                  {enviando ? 'Criando…' : 'Finalizar'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — Dicas */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="bg-v4surface border border-v4border rounded-2xl p-5 shadow-card">
            <h3 className="font-heading font-semibold text-sm mb-3">
              {step === 0 && 'Dicas para criar uma entrevista eficiente:'}
              {step === 1 && 'Dicas para criação de boas perguntas:'}
              {step === 2 && 'Dicas para criar boas perguntas:'}
              {step === 3 && 'Dicas para configurar notificações:'}
              {step === 4 && 'Dicas para configurar sua vaga:'}
            </h3>
            <ul className="text-white/50 text-xs space-y-2">
              {step === 0 && (
                <>
                  <li><strong className="text-white/70">Identificador:</strong> Identifique a entrevista com um identificador único para facilitar a busca.</li>
                  <li><strong className="text-white/70">Título:</strong> Seja claro e objetivo no título da entrevista para atrair os candidatos certos.</li>
                  <li><strong className="text-white/70">Segmento:</strong> Selecione o segmento de atividade econômica para a entrevista.</li>
                </>
              )}
              {step === 1 && (
                <>
                  <li><strong className="text-white/70">Descrição da Vaga:</strong> Seja claro e objetivo na descrição das atividades.</li>
                  <li><strong className="text-white/70">Responsabilidades:</strong> Detalhe as responsabilidades diárias do cargo.</li>
                  <li><strong className="text-white/70">Requisitos:</strong> Liste requisitos realmente necessários para a função.</li>
                </>
              )}
              {step === 2 && (
                <>
                  <li>Faça perguntas abertas que permitam o candidato se expressar.</li>
                  <li>Inclua questões práticas baseadas em situações reais.</li>
                  <li>Evite perguntas que possam ser respondidas com sim ou não.</li>
                </>
              )}
              {step === 3 && (
                <>
                  <li>Personalize a comunicação enviada a candidatos não selecionados.</li>
                  <li>Mantenha um relacionamento profissional positivo.</li>
                  <li>Preserve a imagem da empresa no mercado.</li>
                </>
              )}
              {step === 4 && (
                <>
                  <li>Defina uma data de encerramento realista para o processo.</li>
                  <li>Personalize a mensagem de boas-vindas para engajar os candidatos.</li>
                  <li>Considere o tempo médio de resposta dos candidatos.</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
