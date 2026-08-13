'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function DocsPage() {
  return (
    <div className="bg-fg rounded p-1 -mx-6">
      <SwaggerUI url="/openapi.json" />
    </div>
  );
}
