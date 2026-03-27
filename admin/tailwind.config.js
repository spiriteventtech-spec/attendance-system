/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Apple System Colors
        'sys-blue':   '#007AFF',
        'sys-green':  '#34C759',
        'sys-red':    '#FF3B30',
        'sys-orange': '#FF9500',
        'sys-purple': '#AF52DE',
        'sys-indigo': '#5856D6',
        'sys-teal':   '#30B0C7',
        // Semantic UI
        'apple-bg':       '#F5F5F7',
        'apple-card':     '#FFFFFF',
        'apple-label':    '#1D1D1F',
        'apple-secondary':'#86868B',
        'apple-divider':  'rgba(0,0,0,0.06)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      borderRadius: {
        'ios':  '16px',
        'ios2': '24px',
        'ios3': '32px',
      },
      boxShadow: {
        'premium': '0 8px 32px rgba(0,0,0,0.06)',
        'card':    '0 2px 12px rgba(0,0,0,0.06)',
        'modal':   '0 24px 80px rgba(0,0,0,0.12)',
        'blue':    '0 4px 14px rgba(0,122,255,0.25)',
      },
    },
  },
  plugins: [],
};
