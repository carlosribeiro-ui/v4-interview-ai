'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={null}>
      <RedefinirSenhaForm />
    </Suspense>
  );
}

function RedefinirSenhaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  async function redefinir(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (novaSenha !== confirmar) {
      setErro('As senhas não coincidem');
      return;
    }
    if (novaSenha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres');
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch('/auth/redefinir-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao redefinir senha');
      setSucesso(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: any) {
      setErro(err.message ?? 'Erro ao redefinir senha');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-v4border bg-v4surface p-7 shadow-card v4-fade-in">
        <div className="flex items-center gap-2.5 mb-6">
          <span className="w-9 h-9 rounded-full bg-v4red/15 border border-v4red/30 flex items-center justify-center text-v4red font-heading font-bold text-sm">
            V4
          </span>
          <span className="font-heading text-base font-bold tracking-tight">
            Interview <span className="text-v4red">AI</span>
          </span>
        </div>

        <h1 className="font-heading text-lg font-bold mb-1">Nova senha</h1>

        {!token ? (
          <>
            <p className="text-v4red text-sm mb-5">Link inválido — falta o token de redefinição.</p>
            <Link href="/esqueci-senha" className="text-v4red text-sm hover:underline">
              Solicitar um novo link →
            </Link>
          </>
        ) : sucesso ? (
          <p className="text-white/60 text-sm">Senha redefinida! Redirecionando pro login…</p>
        ) : (
          <form onSubmit={redefinir} className="space-y-3">
            <div>
              <label className="block text-xs text-white/50 mb-1">Nova senha</label>
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
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
              />
            </div>
            {erro && <p className="text-v4red text-sm">{erro}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-white font-semibold px-4 py-2.5 text-sm transition"
            >
              {enviando ? 'Redefinindo…' : 'Redefinir senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
