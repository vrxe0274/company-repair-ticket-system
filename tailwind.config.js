/** @type {import('tailwindcss').Config} */
export default {
  // Dark mode is opt-in via a `dark` class on <html> (see hooks/useTheme.jsx).
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Outfit', 'sans-serif'],
        body:    ['Outfit', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        display: ['Bebas Neue', 'sans-serif'],
      },
      colors: {
        // Primary purple — the V and R in the logo
        brand: {
          50:  '#f5f0ff',
          100: '#ede0ff',
          200: '#d8c0ff',
          300: '#be94ff',
          400: '#a060ff',
          500: '#8833ff',
          600: '#7317e8',
          700: '#6010c4',
          800: '#4f0da0',
          900: '#420c83',
          950: '#28005a',
        },
        // Accent magenta/pink — the X and E in the logo
        accent: {
          50:  '#fff0f8',
          100: '#ffd6ee',
          200: '#ffadde',
          300: '#ff75c8',
          400: '#ff3db0',
          500: '#f0059a',
          600: '#d4007f',
          700: '#b00068',
          800: '#8f0055',
          900: '#750047',
        },
        // Sidebar dark background — matching logo black
        dark: {
          900: '#0d0d0f',
          800: '#141418',
          750: '#191920',
          700: '#1c1c23',
          600: '#26262f',
          500: '#32323d',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-right': 'slideRight 0.35s ease-out',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' },                              to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideRight:{ from: { opacity: '0', transform: 'translateX(-12px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
}
