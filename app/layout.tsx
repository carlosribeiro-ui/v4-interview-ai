import type { Metadata } from 'next';
import { Montserrat, IBM_Plex_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { SessaoProvider, UserBadge, AdminNavLink } from '@/app/components/Sessao';
import ThemeToggle from '@/app/components/ThemeToggle';

// Roda antes do primeiro paint (script síncrono no <head>) — evita o "flash" de tema
// escuro seguido de claro quando o usuário já tinha escolhido claro numa sessão
// anterior. app/globals.css já assume escuro por padrão (:root sem atributo).
const SCRIPT_ANTI_FLASH = `try{if(localStorage.getItem('v4-theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}`;

const fontBody = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body'
});

const fontHeading = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-heading'
});

export const metadata: Metadata = {
  title: 'V4 Interview AI — MVP local',
  description: 'Entrevistas assíncronas com IA, rodando local.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_FLASH }} />
      </head>
      <body className={`min-h-screen font-body ${fontBody.variable} ${fontHeading.variable}`}>
        <SessaoProvider>
          <header className="sticky top-0 z-40 backdrop-blur-md bg-v4bg/80 border-b border-fg/[0.06] px-6 py-3.5 flex items-center justify-between flex-wrap gap-3">
            <a href="/" className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-v4red/15 border border-v4red/30 flex items-center justify-center text-v4red font-heading font-bold text-sm">
                V4
              </span>
              <span className="font-heading text-base font-bold tracking-tight">
                Interview <span className="text-v4red">AI</span>
              </span>
            </a>
            <nav className="flex items-center gap-1.5 text-sm flex-wrap">
              <a
                href="/"
                className="px-3.5 py-1.5 rounded-full text-fg/60 hover:text-fg hover:bg-fg/[0.06] transition"
              >
                Vagas
              </a>
              <a
                href="/candidatos"
                className="px-3.5 py-1.5 rounded-full text-fg/60 hover:text-fg hover:bg-fg/[0.06] transition"
              >
                Candidatos
              </a>
              <a
                href="/dashboard"
                className="px-3.5 py-1.5 rounded-full text-fg/60 hover:text-fg hover:bg-fg/[0.06] transition"
              >
                Dashboard
              </a>
              <a
                href="/relatorios"
                className="px-3.5 py-1.5 rounded-full text-fg/60 hover:text-fg hover:bg-fg/[0.06] transition"
              >
                Relatórios
              </a>
              <a
                href="/testar-entrevista"
                className="px-3.5 py-1.5 rounded-full bg-v4red/10 text-v4red hover:bg-v4red/20 transition font-medium"
              >
                🧪 Testar entrevista
              </a>
              <span className="w-px h-4 bg-fg/10 mx-1" />
              <a
                href="/admin/perguntas"
                className="px-3.5 py-1.5 rounded-full text-fg/40 hover:text-fg hover:bg-fg/[0.06] transition text-xs"
              >
                Analisar perguntas
              </a>
              <a
                href="/docs"
                className="px-3.5 py-1.5 rounded-full text-fg/40 hover:text-fg hover:bg-fg/[0.06] transition text-xs"
              >
                API Docs
              </a>
              <AdminNavLink />
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserBadge />
            </div>
          </header>
          <main className="px-6 py-8 max-w-7xl mx-auto">{children}</main>
        </SessaoProvider>
        <Analytics />
      </body>
    </html>
  );
}
