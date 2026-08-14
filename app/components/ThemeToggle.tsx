'use client';

import { useEffect, useState } from 'react';

const CHAVE_TEMA = 'v4-theme';

/** Aplica o atributo no <html> — única função que mexe no DOM, chamada tanto
    pelo clique local quanto pelo evento de sincronização entre abas abaixo. */
function aplicarNoDom(tema: 'dark' | 'light') {
  if (tema === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/**
 * Alterna entre tema claro (padrão desde 2026-08-14, sem atributo) e escuro
 * (`data-theme="dark"` em <html>). O script inline em app/layout.tsx já aplica
 * o atributo antes do primeiro paint (lendo o mesmo localStorage) — aqui
 * sincroniza o estado do botão com o que já está no DOM, trata o clique, E
 * escuta o evento `storage` pra refletir a troca em TODAS as abas já abertas
 * na hora — sem isso, uma aba já aberta só pegaria o tema novo no próximo
 * reload (localStorage só dispara `storage` nas OUTRAS abas, nunca na que fez
 * a mudança — por isso o clique local ainda precisa aplicar no DOM
 * diretamente, além de gravar no storage).
 */
export default function ThemeToggle() {
  const [tema, setTema] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    const atual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    setTema(atual);

    function aoMudarStorage(e: StorageEvent) {
      if (e.key !== CHAVE_TEMA) return;
      const novo = e.newValue === 'dark' ? 'dark' : 'light';
      aplicarNoDom(novo);
      setTema(novo);
    }
    window.addEventListener('storage', aoMudarStorage);
    return () => window.removeEventListener('storage', aoMudarStorage);
  }, []);

  function alternar() {
    const novo = tema === 'dark' ? 'light' : 'dark';
    setTema(novo);
    aplicarNoDom(novo);
    try {
      localStorage.setItem(CHAVE_TEMA, novo);
    } catch {
      // localStorage indisponível (modo privado etc.) — tema só não persiste entre sessões
      // nem sincroniza com outras abas, mas continua funcionando na aba atual.
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
