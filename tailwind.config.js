/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#121212',
          raised: '#1a1a1a',
          panel: '#1e1e1e',
          border: '#2a2a2a'
        },
        gold: {
          DEFAULT: '#FFD100',
          dim: '#b89400',
          bright: '#ffe45c'
        },
        rarity: {
          poor: '#9d9d9d',
          common: '#ffffff',
          uncommon: '#1eff00',
          rare: '#0070dd',
          epic: '#a335ee',
          legendary: '#ff8000'
        },
        profit: {
          positive: '#1eff00',
          negative: '#ff4444',
          neutral: '#9d9d9d'
        }
      },
      fontFamily: {
        display: ['"Cinzel"', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        'gold-glow': '0 0 12px 0 rgba(255, 209, 0, 0.25)',
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)'
      }
    }
  },
  plugins: []
}
