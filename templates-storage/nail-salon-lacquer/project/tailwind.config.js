/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Rose / blush primary ramp
        rose: {
          50: '#fdf5f8',
          100: '#fceaf1',
          200: '#f9d5e0',
          300: '#f4b1c6',
          400: '#ec829f',
          500: '#df547d',
          600: '#b91c5c',
          700: '#9a1349',
          800: '#7c103b',
          900: '#5e0d2c',
        },
        // Warm neutral taupe ramp
        taupe: {
          50: '#faf8f5',
          100: '#f3efe9',
          200: '#e7e0d6',
          300: '#d4caba',
          400: '#b7a890',
          500: '#9c8a6e',
          600: '#807057',
          700: '#675844',
          800: '#4f4435',
          900: '#37301f',
        },
        accent: {
          DEFAULT: '#c9a96e',
          light: '#e0c89a',
          dark: '#a3854f',
        },
        success: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
        },
        error: {
          50: '#fef2f2',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Jost', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'float': {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22,1,0.36,1) forwards',
        'fade-in': 'fade-in 0.8s ease forwards',
        'scale-in': 'scale-in 0.5s cubic-bezier(0.22,1,0.36,1) forwards',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [],
};
