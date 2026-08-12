'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessao } from '@/app/components/Sessao';
import ExportButtons from '@/app/components/ExportButtons';

type Aba = 'usuarios' | 'logs' | 'webhooks';

type Usuario = { id: string; nome: string; email: string; role: 'admin' | 'talent'; ativo: boolean };
type LogEntry = { id: string; evento: string; ator?: string; detalhes?: Record<string, unknown>; criadoEm: string };
type Webhook = { id: string; nome: string; url: string; eventos: string[]; ativo: boolean; criadoEm: string; atualizadoEm: string };

const RÓTULO_EVENTO: Record<string, string> = {
  login: 'Login',
  login_falhou: 'Login falhou',
  usuario_criado: 'Usuário criado',
  usuario_removido: 'Usuário removido',
  usuario_editado: 'Usuário editado',
  usuario_ativado: 'Usuário ativado',
  usuario_desativado: 'Usuário desativado',
  senha_resetada: 'Senha resetada (admin)',
  senha_alterada: 'Senha alterada (próprio usuário)',
  senha_reset_solicitado: 'Reset de senha solicitado',
  role_alterada: 'Permissão alterada',
  fase_alterada: 'Fase alterada',
  candidatura_criada: 'Candidatura criada',
  candidatura_removida: 'Candidatura removida',
  vaga_criada: 'Vaga criada',
  vaga_removida: 'Vaga removida',
  rate_limit_hit: 'Rate limit atingido',
  rbac_denial: 'Acesso negado (RBAC)',
  auth_failure: 'Falha de autenticação',
  session_revoked: 'Sessão revogada',
  erro_sistema: 'Erro de sistema',
  webhook_config_alterado: 'Webhook de logs alterado'
};

const EVENTOS_LISTA = Object.keys(RÓTULO_EVENTO);

export default function AdminConfigPage() {
  const router = useRouter();
  const { usuario, carregando } = useSessao();
  const [aba, setAba] = useState<Aba>('usuarios');

  useEffect(() => {
    if (!carregando && (!usuario || usuario.role !== 'admin')) router.replace('/');
  }, [carregando, usuario, router]);

  if (carregando || !usuario || usuario.role !== 'admin') {
    return <p className="text-white/50">Carregando…</p>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">⚙ Configurações</h1>
        <p className="text-white/40 text-sm mt-0.5">Usuários, auditoria e integrações — só admin.</p>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            ['usuarios', 'Usuários'],
            ['logs', 'Logs'],
            ['webhooks', 'Webhooks']
          ] as [Aba, string][]
        ).map(([valor, label]) => (
          <button
            key={valor}
            onClick={() => setAba(valor)}
            className={`px-3.5 py-1.5 rounded-full text-sm transition ${
              aba === valor ? 'bg-v4red text-white font-medium' : 'bg-white/[0.05] text-white/60 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'usuarios' && <AbaUsuarios usuarioAtualId={usuario.id} />}
      {aba === 'logs' && <AbaLogs />}
      {aba === 'webhooks' && <AbaWebhooks />}
    </div>
  );
}

/* ────────────────────────────── Usuários ────────────────────────────── */

function AbaUsuarios({ usuarioAtualId }: { usuarioAtualId?: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [role, setRole] = useState<'admin' | 'talent'>('talent');
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    setLoading(true);
    fetch('/api/usuarios')
      .then((r) => r.json())
      .then((data: Usuario[]) => {
        setUsuarios(data);
        setLoading(false);
      });
  }

  useEffect(carregar, []);

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, senha, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar usuário');
      setNome('');
      setEmail('');
      setSenha('');
      setRole('talent');
      setCriando(false);
      carregar();
    } catch (err: any) {
      setErro(err.message ?? 'Erro ao criar usuário');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(u: Usuario) {
    if (!confirm(`Remover o usuário ${u.nome} (${u.email})? Essa ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/usuarios/${u.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? 'Erro ao remover usuário');
      return;
    }
    carregar();
  }

  async function alternarAtivo(u: Usuario) {
    const acao = u.ativo ? 'desativar' : 'reativar';
    if (!confirm(`Confirma ${acao} o usuário ${u.nome} (${u.email})?`)) return;
    const res = await fetch(`/api/usuarios/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !u.ativo })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? `Erro ao ${acao} usuário`);
      return;
    }
    carregar();
  }

  if (loading) return <p className="text-white/50">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-v4border bg-v4surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-white/40 border-b border-white/5">
              <th className="px-4 py-2.5 font-medium">Nome</th>
              <th className="px-4 py-2.5 font-medium">E-mail</th>
              <th className="px-4 py-2.5 font-medium">Papel</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {usuarios.map((u) => (
              <tr key={u.id} className={u.ativo ? '' : 'opacity-50'}>
                <td className="px-4 py-2.5 font-medium truncate max-w-[160px]">{u.nome}</td>
                <td className="px-4 py-2.5 text-white/50 truncate max-w-[220px]">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs capitalize font-medium ${
                    u.role === 'admin' ? 'bg-v4red/20 text-v4red' : 'bg-v4green/20 text-v4green'
                  }`}>{u.role}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.ativo ? 'bg-white/10 text-white/60' : 'bg-v4yellow/15 text-v4yellow'
                  }`}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setEditando(u)}
                      className="text-white/40 hover:text-white text-xs px-2 py-1 rounded-full hover:bg-white/10 transition"
                    >
                      ✎ Editar
                    </button>
                    {u.id !== usuarioAtualId && (
                      <button
                        onClick={() => alternarAtivo(u)}
                        className="text-white/40 hover:text-v4yellow text-xs px-2 py-1 rounded-full hover:bg-white/10 transition"
                      >
                        {u.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    )}
                    <button
                      onClick={() => remover(u)}
                      disabled={u.id === usuarioAtualId}
                      className="text-white/30 hover:text-v4red disabled:opacity-20 text-xs px-2 py-1 rounded-full hover:bg-white/10 transition"
                      title={u.id === usuarioAtualId ? 'Você não pode remover seu próprio usuário' : 'Remover'}
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {erro && <p className="text-sm text-v4red">{erro}</p>}

      {criando ? (
        <form onSubmit={criarUsuario} className="rounded-2xl border border-v4border bg-v4surface p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1">Nome</label>
              <input
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">E-mail</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Senha (mín. 8 caracteres)</label>
              <input
                required
                type="password"
                minLength={8}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Papel</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'talent')}
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red"
              >
                <option value="talent">Talent</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={salvando}
              className="rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-white font-semibold px-4 py-2 text-sm transition"
            >
              {salvando ? 'Criando…' : 'Criar usuário'}
            </button>
            <button
              type="button"
              onClick={() => setCriando(false)}
              className="rounded-full border border-white/10 text-white/60 hover:text-white px-4 py-2 text-sm transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setCriando(true)}
          className="rounded-full border border-white/10 text-white/60 hover:text-white hover:border-white/30 px-4 py-2 text-sm transition"
        >
          + Novo usuário
        </button>
      )}

      {editando && (
        <ModalEditarUsuario
          usuario={editando}
          onClose={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }}
        />
      )}
    </div>
  );
}

function ModalEditarUsuario({
  usuario, onClose, onSalvo
}: {
  usuario: Usuario;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(usuario.nome);
  const [email, setEmail] = useState(usuario.email);
  const [role, setRole] = useState(usuario.role);
  const [novaSenha, setNovaSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const body: Record<string, unknown> = {};
      if (nome !== usuario.nome) body.nome = nome;
      if (email !== usuario.email) body.email = email;
      if (role !== usuario.role) body.role = role;
      if (novaSenha) body.senha = novaSenha;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/usuarios/${usuario.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar');
      onSalvo();
    } catch (err: any) {
      setErro(err.message ?? 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center v4-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={salvar} className="bg-v4bg border border-v4border rounded-2xl p-6 w-full max-w-md shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-lg">Editar usuário</h3>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-lg">✕</button>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Nome</label>
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">E-mail</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Papel</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'talent')}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
          >
            <option value="talent">Talent</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Resetar senha (opcional — deixe em branco pra manter)</label>
          <input
            type="password"
            minLength={8}
            placeholder="Nova senha (mín. 8 caracteres)"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
          />
        </div>
        {erro && <p className="text-sm text-v4red">{erro}</p>}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-white font-semibold px-4 py-2 text-sm transition"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 text-white/60 hover:text-white px-4 py-2 text-sm transition"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

/* ────────────────────────────── Logs ────────────────────────────── */

function AbaLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logAberto, setLogAberto] = useState<LogEntry | null>(null);

  const [evento, setEvento] = useState('');
  const [ator, setAtor] = useState('');
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [ate, setAte] = useState('');

  function montarParams(extra?: Record<string, string>) {
    const params = new URLSearchParams();
    if (evento) params.set('evento', evento);
    if (ator) params.set('ator', ator);
    if (q) params.set('q', q);
    if (desde) params.set('desde', new Date(desde).toISOString());
    if (ate) params.set('ate', new Date(ate).toISOString());
    if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
    return params;
  }

  function carregar() {
    setLoading(true);
    fetch(`/api/logs?${montarParams().toString()}`)
      .then((r) => r.json())
      .then((data: LogEntry[]) => {
        setLogs(data);
        setLoading(false);
      });
  }

  useEffect(carregar, [evento, ator, q, desde, ate]);

  function exportar(formato: 'csv' | 'pdf') {
    window.location.href = `/api/logs?${montarParams({ formato }).toString()}`;
  }

  function limparFiltros() {
    setEvento('');
    setAtor('');
    setQ('');
    setDesde('');
    setAte('');
  }

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={evento}
          onChange={(e) => setEvento(e.target.value)}
          className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-sm outline-none focus:border-v4red"
        >
          <option value="">Todos os eventos</option>
          {EVENTOS_LISTA.map((ev) => (
            <option key={ev} value={ev}>{RÓTULO_EVENTO[ev]}</option>
          ))}
        </select>
        <input
          value={ator}
          onChange={(e) => setAtor(e.target.value)}
          placeholder="Filtrar por ator (e-mail)…"
          className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-sm outline-none focus:border-v4red w-48"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Busca livre…"
          className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-sm outline-none focus:border-v4red w-40"
        />
        <input
          type="datetime-local"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-xs outline-none focus:border-v4red text-white/70"
          title="Desde"
        />
        <input
          type="datetime-local"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-xs outline-none focus:border-v4red text-white/70"
          title="Até"
        />
        {(evento || ator || q || desde || ate) && (
          <button onClick={limparFiltros} className="text-xs text-white/40 hover:text-white px-2">
            ✕ Limpar
          </button>
        )}
        <ExportButtons onExport={exportar} className="ml-auto" />
      </div>

      {loading ? (
        <p className="text-white/50">Carregando…</p>
      ) : logs.length === 0 ? (
        <p className="text-white/40 text-sm">Nenhum evento encontrado com esses filtros.</p>
      ) : (
        <div className="rounded-2xl border border-v4border bg-v4surface divide-y divide-white/5 max-h-[600px] overflow-y-auto">
          {logs.map((l) => (
            <button
              key={l.id}
              onClick={() => setLogAberto(l)}
              className="w-full text-left px-4 py-2.5 text-xs hover:bg-white/[0.04] transition cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{RÓTULO_EVENTO[l.evento] ?? l.evento}</span>
                <span className="text-white/30 shrink-0">{new Date(l.criadoEm).toLocaleString('pt-BR')}</span>
              </div>
              <div className="text-white/40 mt-0.5">
                {l.ator && <span className="mr-2">por {l.ator}</span>}
                {l.detalhes && <span className="break-all line-clamp-1">{JSON.stringify(l.detalhes)}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {logAberto && <ModalDetalheLog log={logAberto} onClose={() => setLogAberto(null)} />}
    </div>
  );
}

function ModalDetalheLog({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onClose]);

  function copiarJson() {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2)).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  const camposDetalhes = Object.entries(log.detalhes ?? {});

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center v4-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-v4bg border border-v4border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-lg">{RÓTULO_EVENTO[log.evento] ?? log.evento}</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white text-lg">✕</button>
        </div>

        <div className="rounded-xl border border-v4border bg-black/20 p-4 space-y-2.5 text-sm">
          <CampoDetalhe label="ID do evento" valor={log.id} mono />
          <CampoDetalhe label="Tipo" valor={log.evento} mono />
          <CampoDetalhe label="Data/hora" valor={new Date(log.criadoEm).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'medium' })} />
          <CampoDetalhe label="Ator" valor={log.ator ?? '—'} />
        </div>

        {camposDetalhes.length > 0 ? (
          <div>
            <p className="text-xs text-white/50 mb-2">Detalhes</p>
            <div className="rounded-xl border border-v4border bg-black/20 p-4 space-y-2.5 text-sm">
              {camposDetalhes.map(([k, v]) => (
                <CampoDetalhe key={k} label={k} valor={typeof v === 'object' ? JSON.stringify(v) : String(v)} mono />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-white/40">Sem detalhes adicionais.</p>
        )}

        <button
          onClick={copiarJson}
          className="rounded-full border border-white/10 text-white/60 hover:text-white hover:border-white/30 px-4 py-2 text-sm transition"
        >
          {copiado ? '✓ Copiado' : '⧉ Copiar JSON completo'}
        </button>
      </div>
    </div>
  );
}

function CampoDetalhe({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-white/40 shrink-0">{label}</span>
      <span className={`text-right break-all ${mono ? 'font-mono text-[11px] text-white/70' : 'text-white/80'}`}>{valor}</span>
    </div>
  );
}

/* ────────────────────────────── Webhooks ────────────────────────────── */

function AbaWebhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Webhook | null>(null);

  function carregar() {
    setLoading(true);
    fetch('/api/config/webhooks')
      .then((r) => r.json())
      .then((data: Webhook[]) => {
        setWebhooks(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }

  useEffect(carregar, []);

  async function alternarAtivo(w: Webhook) {
    const res = await fetch(`/api/config/webhooks/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !w.ativo })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? 'Erro ao alterar webhook');
      return;
    }
    carregar();
  }

  async function remover(w: Webhook) {
    if (!confirm(`Remover o webhook "${w.nome}"?`)) return;
    const res = await fetch(`/api/config/webhooks/${w.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? 'Erro ao remover webhook');
      return;
    }
    carregar();
  }

  if (loading) return <p className="text-white/50">Carregando…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/40">
        POST em tempo real (fire-and-forget) pros eventos selecionados de cada webhook — ex: Slack, Google Chat, n8n.
        Dá pra ter vários, cada um escutando um subconjunto diferente de eventos.
      </p>

      {webhooks.length === 0 ? (
        <p className="text-white/40 text-sm">Nenhum webhook configurado ainda.</p>
      ) : (
        <div className="rounded-2xl border border-v4border bg-v4surface divide-y divide-white/5">
          {webhooks.map((w) => (
            <div key={w.id} className={`p-4 flex items-start justify-between gap-4 ${w.ativo ? '' : 'opacity-50'}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{w.nome}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    w.ativo ? 'bg-v4green/15 text-v4green' : 'bg-white/10 text-white/50'
                  }`}>{w.ativo ? 'Ativo' : 'Inativo'}</span>
                </div>
                <p className="text-xs text-white/40 truncate mt-0.5 font-mono">{w.url}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {w.eventos.map((ev) => (
                    <span key={ev} className="px-2 py-0.5 rounded-full bg-white/[0.06] text-white/50 text-[10px]">
                      {RÓTULO_EVENTO[ev] ?? ev}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setEditando(w)}
                  className="text-white/40 hover:text-white text-xs px-2 py-1 rounded-full hover:bg-white/10 transition"
                >
                  ✎ Editar
                </button>
                <button
                  onClick={() => alternarAtivo(w)}
                  className="text-white/40 hover:text-v4yellow text-xs px-2 py-1 rounded-full hover:bg-white/10 transition"
                >
                  {w.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => remover(w)}
                  className="text-white/30 hover:text-v4red text-xs px-2 py-1 rounded-full hover:bg-white/10 transition"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setModalAberto(true)}
        className="rounded-full border border-white/10 text-white/60 hover:text-white hover:border-white/30 px-4 py-2 text-sm transition"
      >
        + Novo webhook
      </button>

      {modalAberto && (
        <ModalWebhookForm onClose={() => setModalAberto(false)} onSalvo={() => { setModalAberto(false); carregar(); }} />
      )}
      {editando && (
        <ModalWebhookForm webhook={editando} onClose={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); }} />
      )}
    </div>
  );
}

function ModalWebhookForm({
  webhook, onClose, onSalvo
}: {
  webhook?: Webhook;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const editandoExistente = !!webhook;
  const [nome, setNome] = useState(webhook?.nome ?? '');
  const [url, setUrl] = useState(webhook?.url ?? '');
  const [eventosSelecionados, setEventosSelecionados] = useState<Set<string>>(new Set(webhook?.eventos ?? []));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  function toggleEvento(ev: string) {
    setEventosSelecionados((atual) => {
      const next = new Set(atual);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (eventosSelecionados.size === 0) {
      setErro('Selecione ao menos um evento');
      return;
    }
    setSalvando(true);
    try {
      const body = { nome, url, eventos: Array.from(eventosSelecionados) };
      const res = await fetch(
        editandoExistente ? `/api/config/webhooks/${webhook!.id}` : '/api/config/webhooks',
        {
          method: editandoExistente ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar webhook');
      onSalvo();
    } catch (err: any) {
      setErro(err.message ?? 'Erro ao salvar webhook');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center v4-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={salvar} className="bg-v4bg border border-v4border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-lg">{editandoExistente ? 'Editar webhook' : '+ Novo webhook'}</h3>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-lg">✕</button>
        </div>

        <div>
          <label className="block text-xs text-white/50 mb-1">Nome</label>
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Slack #alertas-seguranca"
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">URL</label>
          <input
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/... ou https://chat.googleapis.com/..."
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-2">Eventos que disparam esse webhook</label>
          <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
            {EVENTOS_LISTA.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={eventosSelecionados.has(ev)}
                  onChange={() => toggleEvento(ev)}
                  className="accent-v4red"
                />
                {RÓTULO_EVENTO[ev]}
              </label>
            ))}
          </div>
        </div>

        {erro && <p className="text-sm text-v4red">{erro}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-white font-semibold px-4 py-2 text-sm transition"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 text-white/60 hover:text-white px-4 py-2 text-sm transition"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
