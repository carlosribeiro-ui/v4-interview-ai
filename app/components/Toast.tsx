'use client';

import { useCallback, useState } from 'react';

type ToastMsg = { id: number; texto: string; tipo: 'sucesso' | 'erro' };

/** Toast leve sem dependência nova — usado no lugar de textos inline tipo "Copiado!"/"Salvo!". */
export function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  const mostrar = useCallback((texto: string, tipo: ToastMsg['tipo'] = 'sucesso') => {
    const id = Date.now() + Math.random();
    setToasts((atual) => [...atual, { id, texto, tipo }]);
    setTimeout(() => setToasts((atual) => atual.filter((t) => t.id !== id)), 2800);
  }, []);

  const ToastContainer = (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded border px-4 py-2.5 text-sm font-medium shadow-lg bg-v4surface ${
            t.tipo === 'sucesso' ? 'border-v4green text-v4green' : 'border-v4red text-v4red'
          }`}
        >
          {t.texto}
        </div>
      ))}
    </div>
  );

  return { mostrar, ToastContainer };
}
