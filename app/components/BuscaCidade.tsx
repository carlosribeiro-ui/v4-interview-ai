'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
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
 * Filtra a lista estatica localmente (sem API) conforme o user digita.
 * Mostra TODAS as cidades que combinam — scroll livre.
 */
export default function BuscaCidade({ uf, value, onChange, disabled, placeholder }: Props) {
  const [termo, setTermo] = useState(value);
  const [aberto, setAberto] = useState(false);
  const [indiceFoco, setIndiceFoco] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Sincroniza valor externo
  useEffect(() => { setTermo(value); }, [value]);

  const cidades = useMemo(() => CIDADES_por_UF[uf?.toUpperCase()] ?? [], [uf]);

  const filtradas = useMemo(() => {
    if (!termo.trim()) return [];
    const t = termo.toLowerCase();
    return cidades.filter((c) => c.toLowerCase().includes(t));
  }, [termo, cidades]);

  // Rola o item focado pra visivel
  useEffect(() => {
    if (indiceFoco >= 0 && itemRefs.current[indiceFoco]) {
      itemRefs.current[indiceFoco]?.scrollIntoView({ block: 'nearest' });
    }
  }, [indiceFoco]);

  function selecionar(cidade: string) {
    onChange(cidade);
    setTermo(cidade);
    setAberto(false);
    setIndiceFoco(-1);
  }

  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberto(true);
      setIndiceFoco((i) => Math.min(i + 1, filtradas.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceFoco((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && indiceFoco >= 0 && indiceFoco < filtradas.length) {
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

  const mostrarDropdown = aberto && termo.trim().length > 0;

  return (
    <div className="relative" ref={listaRef}>
      <input
        ref={inputRef}
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
          setIndiceFoco(-1);
          if (e.target.value === '') onChange('');
        }}
        onFocus={() => { if (!disabled) setAberto(true); }}
        disabled={disabled}
        placeholder={placeholder ?? 'Digite para buscar…'}
        className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-v4red disabled:opacity-40"
        autoComplete="off"
        onKeyDown={tecla}
      />

      {mostrarDropdown && filtradas.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded border border-white/10 bg-v4gray950 shadow-lg">
          <div className="px-3 py-1 text-xs text-white/30 border-b border-white/5">
            {filtradas.length} cidade{filtradas.length !== 1 ? 's' : ''}
          </div>
          {filtradas.map((cid, i) => (
            <button
              key={cid}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selecionar(cid); }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                i === indiceFoco
                  ? 'bg-v4green/20 text-v4green'
                  : 'text-white/70 hover:bg-white/5'
              }`}
            >
              {cid}
            </button>
          ))}
        </div>
      )}

      {mostrarDropdown && filtradas.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded border border-white/10 bg-v4gray950 px-3 py-2 text-sm text-white/40 shadow-lg">
          Nenhuma cidade encontrada para &quot;{termo}&quot;
        </div>
      )}
    </div>
  );
}
