'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessao } from '@/app/components/Sessao';

export default function PerfilPage() {
  const router = useRouter();
  const { usuario, carregando } = useSessao();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [erroDados, setErroDados] = useState('');
  const [sucessoDados, setSucessoDados] = useState(false);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState('');
  const [sucessoSenha, setSucessoSenha] = useState(false);

  useEffect(() => {
    if (!carregando && !usuario) router.replace('/login');
  }, [carregando, usuario, router]);

  useEffect(() => {
    if (usuario) {
      setNome(usuario.nome);
      setEmail(usuario.email);
    }
  }, [usuario]);

  if (carregando || !usuario) {
    return <p className="text-white/50">Carregando…</p>;
  }

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault();
    setErroDados('');
    setSucessoDados(false);
    setSalvandoDados(true);
    try {
      const res = await fetch('/usuarios/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar');
      setSucessoDados(true);
      setTimeout(() => setSucessoDados(false), 3000);
    } catch (err: any) {
      setErroDados(err.message ?? 'Erro ao salvar dados');
    } finally {
      setSalvandoDados(false);
    }
  }

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    setErroSenha('');
    setSucessoSenha(false);
    if (novaSenha !== confirmarSenha) {
      setErroSenha('As senhas novas não conferem');
      return;
    }
    setSalvandoSenha(true);
    try {
      const res = await fetch('/usuarios/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senhaAtual, novaSenha })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao trocar senha');
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');
      setSucessoSenha(true);
      setTimeout(() => setSucessoSenha(false), 3000);
    } catch (err: any) {
      setErroSenha(err.message ?? 'Erro ao trocar senha');
    } finally {
      setSalvandoSenha(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">👤 Meu perfil</h1>
        <p className="text-white/40 text-sm mt-0.5">
          {usuario.nome} · <span className="capitalize">{usuario.role}</span>
        </p>
      </div>

      <form onSubmit={salvarDados} className="rounded-2xl border border-v4border bg-v4surface p-5 space-y-4">
        <h2 className="font-heading font-semibold text-sm text-white/70">Dados</h2>
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
        {erroDados && <p className="text-sm text-v4red">{erroDados}</p>}
        {sucessoDados && <p className="text-sm text-v4green">✓ Dados atualizados</p>}
        <button
          type="submit"
          disabled={salvandoDados}
          className="rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-white font-semibold px-4 py-2 text-sm transition"
        >
          {salvandoDados ? 'Salvando…' : 'Salvar dados'}
        </button>
      </form>

      <form onSubmit={trocarSenha} className="rounded-2xl border border-v4border bg-v4surface p-5 space-y-4">
        <h2 className="font-heading font-semibold text-sm text-white/70">Trocar senha</h2>
        <div>
          <label className="block text-xs text-white/50 mb-1">Senha atual</label>
          <input
            required
            type="password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Nova senha (mín. 8 caracteres)</label>
          <input
            required
            type="password"
            minLength={8}
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Confirmar nova senha</label>
          <input
            required
            type="password"
            minLength={8}
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
          />
        </div>
        {erroSenha && <p className="text-sm text-v4red">{erroSenha}</p>}
        {sucessoSenha && <p className="text-sm text-v4green">✓ Senha alterada</p>}
        <button
          type="submit"
          disabled={salvandoSenha}
          className="rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-white font-semibold px-4 py-2 text-sm transition"
        >
          {salvandoSenha ? 'Salvando…' : 'Trocar senha'}
        </button>
      </form>
    </div>
  );
}
