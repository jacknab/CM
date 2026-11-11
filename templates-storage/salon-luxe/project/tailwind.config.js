/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Cormorant Garamond', 'serif'],
      },
      colors: {
        primary: {
          50: '#fdf2f4',
          100: '#fce7ec',
          200: '#fad0db',
          300: '#f5a8bd',
          400: '#ec7196',
          500: '#de4877',
          600: '#c92a5e',
          700: '#a91e4d',
          800: '#8c1d44',
          900: '#761d3d',
        },
        accent: {
          50: '#fbf7ef',
          100: '#f5ecd4',
          200: '#ead7a8',
          300: '#ddbb77',
          400: '#d0a050',
          500: '#b8860b',
          600: '#9a6f0a',
          700: '#7c540c',
          800: '#654310',
          900: '#553811',
        },
        success: {
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        error: {
          400: '#f87171',
          500: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
