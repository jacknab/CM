/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: {
          50: '#FDFCFA',
          100: '#FAF8F5',
          200: '#F5F0EA',
          300: '#EDE5DC',
        },
        gold: {
          300: '#E8D5A3',
          400: '#D4AF6A',
          500: '#C49A3C',
          600: '#A67C2E',
        },
        rose: {
          blush: '#E8B4A0',
          deep: '#C8956C',
          warm: '#D4856A',
        },
        teal: {
          salon: '#2A9D8F',
          light: '#3BB5A6',
          dark: '#1F7A6E',
        },
        charcoal: {
          900: '#111111',
          800: '#1C1C1C',
          700: '#2A2A2A',
          600: '#3A3A3A',
        },
      },
      backgroundImage: {
        'hero-overlay': 'linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.1) 100%)',
      },
    },
  },
  plugins: [],
};
