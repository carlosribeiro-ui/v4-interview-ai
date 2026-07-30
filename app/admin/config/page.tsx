'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessao } from '@/app/components/Sessao';

type Aba = 'automacoes' | 'usuarios' | 'logs';

type Automacao = { vagaId: string; vagaCargo: string; faseId: string; faseNome: string; webhookUrl?: string };
type Usuario = { id: string; nome: string; email: string; role: 'admin' | 'talent' };
type LogEntry = { id: string; evento: string; ator?: string; detalhes?: Record<string, unknown>; criadoEm: string };

const RÓTULO_EVENTO: Record<string, string> = {
  login: 'Login',
  login_falhou: 'Login falhou',
  usuario_criado: 'Usuário criado',
  usuario_removido: 'Usuário removido',
  webhook_configurado: 'Webhook configurado',
  webhook_disparado: 'Webhook disparado',
  webhook_falhou: 'Webhook falhou',
  fase_alterada: 'Fase alterada',
  candidatura_criada: 'Candidatura criada',
  vaga_criada: 'Vaga criada'
};

export default function AdminConfigPage() {
  const router = useRouter();
  const { usuario, carregando } = useSessao();
  const [aba, setAba] = useState<Aba>('automacoes');

  useEffect(() => {
    if (!carregando && (!usuario || usuario.role !== 'admin')) router.replace('/');
  }, [carregando, usuario, router]);

  if (carregando || !usuario || usuario.role !== 'admin') {
    return <p className="text-white/50">Carregando…</p>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">⚙ Configurações</h1>
        <p className="text-white/40 text-sm mt-0.5">Automações, usuários e trilha de auditoria — só admin.</p>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            ['automacoes', 'Automações (webhooks)'],
            ['usuarios', 'Usuários'],
            ['logs', 'Logs']
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

      {aba === 'automacoes' && <AbaAutomacoes />}
      {aba === 'usuarios' && <AbaUsuarios usuarioAtualId={usuario.id} />}
      {aba === 'logs' && <AbaLogs />}
    </div>
  );
}

function AbaAutomacoes() {
  const [itens, setItens] = useState<Automacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');

  function carregar() {
    setLoading(true);
    fetch('/api/admin/automacoes')
      .then((r) => r.json())
      .then((data: Automacao[]) => {
        setItens(data);
        setRascunhos(Object.fromEntries(data.map((i) => [`${i.vagaId}:${i.faseId}`, i.webhookUrl ?? ''])));
        setLoading(false);
      });
  }

  useEffect(carregar, []);

  async function salvar(item: Automacao) {
    const chave = `${item.vagaId}:${item.faseId}`;
    setErro('');
    setSalvando(chave);
    try {
      const res = await fetch('/api/admin/automacoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vagaId: item.vagaId, faseId: item.faseId, webhookUrl: rascunhos[chave] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar');
      carregar();
    } catch (err: any) {
      setErro(err.message ?? 'Erro ao salvar');
    } finally {
      setSalvando(null);
    }
  }

  if (loading) return <p className="text-white/50">Carregando…</p>;

  const porVaga = itens.reduce<Record<string, Automacao[]>>((acc, i) => {
    (acc[i.vagaId] ??= []).push(i);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <p className="text-sm text-white/50">
        Um POST é disparado sempre que uma candidatura entra na fase configurada — útil pra integrar com n8n,
        Pipefy ou qualquer automação externa. Deixe em branco pra desativar.
      </p>
      {erro && <p className="text-sm text-v4red">{erro}</p>}
      {Object.entries(porVaga).length === 0 ? (
        <p className="text-white/40 text-sm">Nenhuma vaga cadastrada ainda.</p>
      ) : (
        Object.entries(porVaga).map(([vagaId, fases]) => (
          <div key={vagaId} className="rounded-2xl border border-v4border bg-v4surface p-4 space-y-2.5">
            <h3 className="font-heading text-sm font-semibold">{fases[0].vagaCargo}</h3>
            {fases.map((f) => {
              const chave = `${f.vagaId}:${f.faseId}`;
              return (
                <div key={chave} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs text-white/50">{f.faseNome}</span>
                  <input
                    value={rascunhos[chave] ?? ''}
                    onChange={(e) => setRascunhos((r) => ({ ...r, [chave]: e.target.value }))}
                    placeholder="https://…"
                    className="flex-1 min-w-0 rounded-lg bg-black/30 border border-white/10 px-2.5 py-1.5 text-xs outline-none focus:border-v4red"
                  />
                  <button
                    onClick={() => salvar(f)}
                    disabled={salvando === chave}
                    className="shrink-0 rounded-lg bg-v4red/15 text-v4red hover:bg-v4red/25 disabled:opacity-50 px-3 py-1.5 text-xs font-medium"
                  >
                    {salvando === chave ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

function AbaUsuarios({ usuarioAtualId }: { usuarioAtualId?: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
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
    if (!confirm(`Remover o usuário ${u.nome} (${u.email})?`)) return;
    const res = await fetch(`/api/usuarios/${u.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? 'Erro ao remover usuário');
      return;
    }
    carregar();
  }

  if (loading) return <p className="text-white/50">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-v4border bg-v4surface p-4 divide-y divide-white/5">
        {usuarios.map((u) => (
          <div key={u.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{u.nome}</div>
              <div className="text-xs text-white/40 truncate">{u.email}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-white/50 text-xs capitalize">{u.role}</span>
              <button
                onClick={() => remover(u)}
                disabled={u.id === usuarioAtualId}
                className="text-white/30 hover:text-v4red disabled:opacity-20 text-xs px-1.5"
                title={u.id === usuarioAtualId ? 'Você não pode remover seu próprio usuário' : 'Remover'}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
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
    </div>
  );
}

function AbaLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/logs')
      .then((r) => r.json())
      .then((data: LogEntry[]) => {
        setLogs(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-white/50">Carregando…</p>;
  if (logs.length === 0) return <p className="text-white/40 text-sm">Nenhum evento registrado ainda.</p>;

  return (
    <div className="rounded-2xl border border-v4border bg-v4surface divide-y divide-white/5 max-h-[600px] overflow-y-auto">
      {logs.map((l) => (
        <div key={l.id} className="px-4 py-2.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{RÓTULO_EVENTO[l.evento] ?? l.evento}</span>
            <span className="text-white/30 shrink-0">{new Date(l.criadoEm).toLocaleString('pt-BR')}</span>
          </div>
          <div className="text-white/40 mt-0.5">
            {l.ator && <span className="mr-2">por {l.ator}</span>}
            {l.detalhes && <span className="break-all">{JSON.stringify(l.detalhes)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
