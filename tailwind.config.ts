import type { Config } from 'tailwindcss'

/**
 * Paleta extraída da fachada do studio: quartzo rosa polido com
 * lettering em ouro escovado. Nada de rosa "bebê" — o tom é mineral,
 * acinzentado, com o ouro entrando só onde precisa chamar atenção.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Superfícies — o "mármore"
        quartzo: {
          50:  '#FDFAFA',
          100: '#F8F1F1',
          200: '#F0E3E4',
          300: '#E4CDD0',
          400: '#D5AEB4',
          500: '#C98F98',
          600: '#B0737E',
          700: '#8E5A65',
        },
        // Acento — o ouro da fachada
        ouro: {
          100: '#F6EEDC',
          200: '#EADDBB',
          300: '#DBC48C',
          400: '#C8A85F',
          500: '#B08A3E',
          600: '#8F6E2E',
          700: '#6B5222',
        },
        // Texto e estrutura — marrom-ônix, nunca preto puro
        onix: {
          50:  '#F6F3F3',
          100: '#EBE5E6',
          200: '#D9D0D1',
          300: '#B7A9AB',
          400: '#8E7E81',
          500: '#6B5B5E',
          600: '#4E4043',
          700: '#3A2E31',
          800: '#2A2124',
          900: '#1C1517',
        },
        sucesso: '#4F7A62',
        alerta:  '#B4802F',
        perigo:  '#A64B52',
        // Ponte para o ThemeProvider (identidade trocável em runtime)
        marca: {
          DEFAULT: 'rgb(var(--marca) / <alpha-value>)',
          suave:   'rgb(var(--marca-suave) / <alpha-value>)',
          contraste: 'rgb(var(--marca-contraste) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Display: geométrica de caixa alta e tracking largo, como a placa
        display: ['Jost', 'Futura', 'Century Gothic', 'system-ui', 'sans-serif'],
        // Corpo: neutra, legível em tela pequena
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Assinatura: só no monograma e em citações curtas
        assinatura: ['Cormorant Garamond', 'Georgia', 'serif'],
      },
      fontSize: {
        eyebrow: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.18em' }],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      boxShadow: {
        // Sombras quentes, nunca cinza-azuladas
        carta: '0 1px 2px rgba(58,46,49,.05), 0 8px 24px -12px rgba(58,46,49,.14)',
        alta:  '0 2px 4px rgba(58,46,49,.06), 0 24px 48px -20px rgba(58,46,49,.24)',
        ouro:  '0 0 0 1px rgba(176,138,62,.28), 0 8px 24px -14px rgba(176,138,62,.5)',
      },
      backgroundImage: {
        // Veio de quartzo: usado uma vez por tela, no máximo
        quartzo: 'radial-gradient(120% 120% at 12% 8%, #F8EFEF 0%, #F0DEE0 38%, #E7CFD3 62%, #F5EBEA 100%)',
        ouro: 'linear-gradient(102deg, #8F6E2E 0%, #C8A85F 38%, #F0E0B6 52%, #C8A85F 66%, #8F6E2E 100%)',
      },
      keyframes: {
        surgir: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
        brilho: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        surgir: 'surgir .28s cubic-bezier(.2,.8,.2,1) both',
        brilho: 'brilho 1.6s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
