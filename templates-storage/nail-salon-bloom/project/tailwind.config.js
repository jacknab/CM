/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm cream / parchment backgrounds
        cream: {
          50:  '#FDFCFA',
          100: '#F8F5F0',
          200: '#EDE8DF',
          300: '#D8D0C4',
          400: '#BDB4A5',
        },
        // Deep ink for text
        ink: {
          900: '#1A1814',
          800: '#2C2925',
          700: '#4A4540',
          600: '#6B6560',
          500: '#8C8680',
          400: '#B0ABA5',
          300: '#CCC7C2',
          200: '#E2DDD8',
          100: '#F0EDE9',
          50:  '#FAF9F7',
        },
        // Warm gold accent for CTAs
        gold: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up':  'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) forwards',
        'fade-in':  'fade-in 0.7s ease forwards',
        'scale-in': 'scale-in 0.5s cubic-bezier(0.22,1,0.36,1) forwards',
      },
    },
  },
  plugins: [],
};
