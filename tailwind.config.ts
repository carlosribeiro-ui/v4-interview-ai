import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
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
        // Fundo quase-preto (padrão de referência visual) + camadas de superfície
        // translúcidas usadas nos cards — substituem o cinza chapado anterior.
        v4bg: '#0A0A0B',
        v4surface: '#131315',
        v4border: 'rgba(255,255,255,0.08)'
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
