'use client';

import { useEffect, useState } from 'react';

const CHAVE_TEMA = 'v4-theme';

/**
 * Alterna entre tema escuro (padrão, sem atributo) e claro (`data-theme="light"`
 * em <html>). O script inline em app/layout.tsx já aplica o atributo antes do
 * primeiro paint (lendo o mesmo localStorage) — aqui só sincroniza o estado do
 * botão com o que já está no DOM e trata o clique.
 */
export default function ThemeToggle() {
  const [tema, setTema] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const atual = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    setTema(atual);
  }, []);

  function alternar() {
    const novo = tema === 'dark' ? 'light' : 'dark';
    setTema(novo);
    if (novo === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem(CHAVE_TEMA, novo);
    } catch {
      // localStorage indisponível (modo privado etc.) — tema só não persiste entre sessões.
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      aria-label={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-fg/60 hover:text-fg hover:bg-fg/[0.06] transition"
    >
      {tema === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
