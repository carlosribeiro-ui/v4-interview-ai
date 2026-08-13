'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function DocsPage() {
  return (
    // swagger-ui-react vem com CSS próprio sempre claro (fundo branco/texto escuro,
    // não segue o tema do app) — bg-white fixo aqui de propósito, não bg-fg.
    <div className="bg-white rounded p-1 -mx-6">
      <SwaggerUI url="/openapi.json" />
    </div>
  );
}
