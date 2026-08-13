import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        v4red: '#E50914',
        v4redDark: '#B20710',
        v4redDeep: '#80050B',
        v4redShadow: '#400306',
        v4gray950: '#1A1A1A',
        v4gray900: '#262626',
        v4green: '#52CC5A',
        v4yellow: '#FFC02A',
        // v4bg/v4surface/v4border leem de CSS vars (app/globals.css) que trocam de
        // valor sob [data-theme="light"] — ThemeToggle seta o atributo em <html>.
        // Mantém os mesmos nomes de classe (bg-v4bg, bg-v4surface, border-v4border)
        // em todo o app; só o valor por trás muda com o tema, nada de renomear uso.
        v4bg: 'rgb(var(--c-bg) / <alpha-value>)',
        v4surface: 'rgb(var(--c-surface) / <alpha-value>)',
        v4border: 'rgb(var(--c-border-base) / 0.08)',
        // "fg" = substitui o antigo "white" cru em text-/border-/bg-/divide-/ring-
        // — no tema claro vira grafite escuro, então continua sendo "a cor do
        // texto/traço", nunca literalmente branco.
        fg: 'rgb(var(--c-fg) / <alpha-value>)',
        // "field" = substitui o antigo "black" cru, usado só como fundo de
        // input/textarea/select recuado. Fica fixo em preto propositalmente: preto
        // em baixa opacidade sobre fundo escuro (tema dark) ou sobre fundo claro
        // (tema light) sempre lê como "levemente mais escuro que a página" —
        // exatamente o efeito de campo recuado nos dois temas, sem precisar de
        // variável.
        field: 'rgb(0 0 0 / <alpha-value>)'
      },
      fontFamily: {
        heading: ['var(--font-heading)'],
        body: ['var(--font-body)']
      },
      borderRadius: {
        DEFAULT: '10px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
        full: '9999px'
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.5)'
      }
    }
  },
  plugins: []
};

export default config;
