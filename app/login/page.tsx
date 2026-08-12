'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao entrar');
      router.push(searchParams.get('next') || '/');
      router.refresh();
    } catch (err: any) {
      setErro(err.message ?? 'Erro ao entrar');
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

        <h1 className="font-heading text-lg font-bold mb-1">Entrar</h1>
        <p className="text-white/40 text-sm mb-5">Acesso restrito ao time (admin/talent).</p>

        <form onSubmit={entrar} className="space-y-3">
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
            <label className="block text-xs text-white/50 mb-1">Senha</label>
            <input
              required
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
            />
          </div>
          {erro && <p className="text-v4red text-sm">{erro}</p>}
          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-white font-semibold px-4 py-2.5 text-sm transition"
          >
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <Link href="/esqueci-senha" className="block text-center text-white/40 text-xs hover:text-white/60 mt-1">
            Esqueci minha senha
          </Link>
        </form>
      </div>
    </div>
  );
}
