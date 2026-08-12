'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function solicitar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await fetch('/auth/esqueci-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
    } finally {
      // V-SEC: mostra a mesma mensagem de sucesso mesmo se a request falhar de
      // verdade (timeout, etc) — não dá pra diferenciar "e-mail não existe" de
      // "deu erro" pro usuário, senão vira oráculo de enumeração de contas.
      setEnviado(true);
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

        <h1 className="font-heading text-lg font-bold mb-1">Esqueci minha senha</h1>

        {enviado ? (
          <>
            <p className="text-white/60 text-sm mb-5">
              Se <strong>{email}</strong> tiver uma conta, enviamos um link de redefinição — confira sua caixa de entrada
              (e o spam). O link expira em 30 minutos.
            </p>
            <Link href="/login" className="text-v4red text-sm hover:underline">
              ← Voltar pro login
            </Link>
          </>
        ) : (
          <>
            <p className="text-white/40 text-sm mb-5">Digite seu e-mail corporativo — enviamos um link pra redefinir.</p>
            <form onSubmit={solicitar} className="space-y-3">
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
              <button
                type="submit"
                disabled={enviando}
                className="w-full rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-white font-semibold px-4 py-2.5 text-sm transition"
              >
                {enviando ? 'Enviando…' : 'Enviar link de redefinição'}
              </button>
              <Link href="/login" className="block text-center text-white/40 text-xs hover:text-white/60 mt-2">
                ← Voltar pro login
              </Link>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
