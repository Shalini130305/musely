/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Playfair Display', 'Inter', 'Georgia', 'serif'],
      },
      colors: {
        // MUSELY India-First Palette
        brand: {
          bg: '#0B0B0D',
          secondary: '#151519',
          card: '#1C1C22',
          pink: '#FF4F9A',
          'pink-soft': '#FF8FBD',
          'pink-hover': '#FF72AD',
          border: '#303039',
          text: '#FFFFFF',
          'text-muted': '#B8B8C2',
        },
        // Backward-compatible token maps
        accent: {
          50: '#fff0f6',
          100: '#ffd6e7',
          200: '#ffb3d4',
          300: '#FF8FBD',
          400: '#FF72AD',
          500: '#FF4F9A',
          600: '#FF4F9A',
          700: '#e03a83',
          800: '#b82867',
          900: '#941e52',
          950: '#38061c',
        },
        charcoal: {
          950: '#070709',
          900: '#0B0B0D',
          850: '#111115',
          800: '#151519',
          700: '#1C1C22',
          600: '#26262E',
          500: '#303039',
          400: '#757582',
          300: '#9A9AA6',
          200: '#B8B8C2',
          100: '#E1E1E6',
          50: '#F5F5F7',
        },
        cream: {
          50: '#151519',
          100: '#1C1C22',
          200: '#26262E',
          300: '#303039',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'soft': '0 2px 16px rgba(0,0,0,0.4)',
        'hover': '0 8px 30px rgba(255,79,154,0.15)',
        'card': '0 1px 3px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)',
        'pink-glow': '0 0 20px rgba(255,79,154,0.35)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
