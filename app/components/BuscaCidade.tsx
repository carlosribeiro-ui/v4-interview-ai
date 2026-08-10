'use client';

import { useState, useRef, useEffect } from 'react';
import { CIDADES_por_UF } from '@/lib/cidades-brasil';

type Props = {
  uf: string;
  value: string;
  onChange: (cidade: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Input com autocomplete para cidades brasileiras.
 * Filtra a lista estática localmente (sem API) conforme o user digita.
 * Mostra no máximo 8 sugestões para não poluir a tela.
 */
export default function BuscaCidade({ uf, value, onChange, disabled, placeholder }: Props) {
  const [termo, setTermo] = useState(value);
  const [aberto, setAberto] = useState(false);
  const [indiceFoco, setIndiceFoco] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // Sincroniza valor externo
  useEffect(() => { setTermo(value); }, [value]);

  const cidades = CIDADES_por_UF[uf?.toUpperCase()] ?? [];
  const filtradas = termo.trim().length > 0
    ? cidades.filter((c) => c.toLowerCase().includes(termo.toLowerCase())).slice(0, 8)
    : cidades.slice(0, 8);

  function selecionar(cidade: string) {
    onChange(cidade);
    setTermo(cidade);
    setAberto(false);
    setIndiceFoco(-1);
  }

  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceFoco((i) => Math.min(i + 1, filtradas.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceFoco((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && indiceFoco >= 0) {
      e.preventDefault();
      selecionar(filtradas[indiceFoco]);
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  }

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (listaRef.current && !listaRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={listaRef}>
      <input
        ref={inputRef}
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
          setIndiceFoco(-1);
          // Se limpar o campo, limpa a seleção
          if (e.target.value === '') onChange('');
        }}
        onFocus={() => { if (!disabled) setAberto(true); }}
        onBlur={() => { setTimeout(() => setAberto(false), 150); }}
        disabled={disabled}
        placeholder={placeholder ?? 'Digite para buscar…'}
        className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red disabled:opacity-40"
        autoComplete="off"
        onKeyDown={tecla}
      />
      {aberto && filtradas.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded border border-white/10 bg-v4gray950 shadow-lg">
          {filtradas.map((cid, i) => (
            <button
              key={cid}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selecionar(cid); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                i === indiceFoco ? 'bg-v4green/20 text-v4green' : 'text-white/70 hover:bg-white/5'
              }`}
            >
              {cid}
            </button>
          ))}
        </div>
      )}
      {aberto && termo.trim().length > 0 && filtradas.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded border border-white/10 bg-v4gray950 px-3 py-2 text-sm text-white/40 shadow-lg">
          Nenhuma cidade encontrada
        </div>
      )}
    </div>
  );
}
