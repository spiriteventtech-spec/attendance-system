/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#252634',
        elevated: '#2D2E3D',
        panel: 'rgba(45, 46, 61, 0.8)',
        brand: {
          DEFAULT: '#00F5FF', // Neon Cyan
          purple: '#A855F7',
          blue: '#3B82F6',
          orange: '#FB923C',
          rose: '#F43F5E',
          green: '#39FF14',   // Apple Neon Green
          red: '#FF3131',     // Hazard Red
        },
        steel: {
          900: '#1A1B26',
          800: '#252634',
          700: '#2D2E3D',
          400: '#94A3B8',
          500: '#64748B',
        }
      },
      fontFamily: {
        sans: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 100%)',
      },
      boxShadow: {
        'soft-3d': '0 20px 50px rgba(0,0,0,0.3)',
        'neon-cyan': '0 0 15px rgba(0, 245, 255, 0.3)',
        'neon-green': '0 0 15px rgba(57, 255, 20, 0.3)',
        'neon-red': '0 0 15px rgba(255, 49, 49, 0.3)',
        'premium': 'var(--shadow-premium)',
      }
    },
  },
  plugins: [],
};
