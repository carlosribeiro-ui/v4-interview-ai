'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Usuario = { id: string; nome: string; email: string; role: 'admin' | 'talent' };

const SessaoContext = createContext<{ usuario: Usuario | null; carregando: boolean }>({
  usuario: null,
  carregando: true
});

export function useSessao() {
  return useContext(SessaoContext);
}

export function SessaoProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch('/auth/me')
      .then((r) => (r.ok ? r.json() : { usuario: null }))
      .then((d) => setUsuario(d.usuario))
      .finally(() => setCarregando(false));
  }, []);

  return <SessaoContext.Provider value={{ usuario, carregando }}>{children}</SessaoContext.Provider>;
}

export function AdminNavLink() {
  const { usuario } = useSessao();
  if (usuario?.role !== 'admin') return null;
  return (
    <a
      href="/admin/config"
      className="px-3.5 py-1.5 rounded-full text-fg/40 hover:text-fg hover:bg-fg/[0.06] transition text-xs"
    >
      ⚙ Configurações
    </a>
  );
}

export function UserBadge() {
  const { usuario } = useSessao();
  const router = useRouter();

  if (!usuario) return null;

  async function sair() {
    await fetch('/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:flex items-center gap-1.5 text-xs text-fg/50">
        <span className="w-6 h-6 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-[10px] font-bold">
          {usuario.nome[0]?.toUpperCase()}
        </span>
        {usuario.nome}
        <span className="px-1.5 py-0.5 rounded-full bg-fg/[0.06] text-fg/40 capitalize">{usuario.role}</span>
      </span>
      <a
        href="/perfil"
        className="text-xs text-fg/40 hover:text-fg px-2.5 py-1.5 rounded-full hover:bg-fg/[0.06] transition"
      >
        Meu perfil
      </a>
      <button
        onClick={sair}
        className="text-xs text-fg/40 hover:text-fg px-2.5 py-1.5 rounded-full hover:bg-fg/[0.06] transition"
      >
        Sair
      </button>
    </div>
  );
}
