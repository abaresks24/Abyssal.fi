/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Pacifica design tokens — mapped to CSS variables
        background:  'var(--background)',
        foreground:  'var(--foreground)',
        popover:     'var(--popover)',
        accent:      'var(--accent)',
        secondary:   'var(--secondary)',
        border:      'var(--border)',
        muted:       'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',

        // Brand
        primary:     'var(--primary)',
        'primary-hover': 'var(--primary-hover)',

        // Trading
        bid:         'var(--bid)',
        ask:         'var(--ask)',
        warn:        'var(--warn)',

        // Legacy aliases (used in existing components — keep working)
        'abyssal': {
          'bg':      'var(--background)',
          'surface': 'var(--accent)',
          'card':    'var(--popover)',
          'border':  'var(--border)',
          'muted':   'var(--secondary)',
        },
        'gain':      'var(--bid)',
        'loss':      'var(--ask)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
      boxShadow: {
        card:      '0 4px 24px rgba(0,0,0,0.4)',
        primary:   '0 0 20px rgba(85,195,233,0.15)',
        'primary-sm': '0 0 8px rgba(85,195,233,0.2)',
      },
      animation: {
        'pulse-primary': 'pulse-primary 2s ease-in-out infinite',
        'slide-in':      'slide-in 0.2s ease-out',
        'fade-in':       'fade-in 0.3s ease-out',
      },
      keyframes: {
        'pulse-primary': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(85,195,233,0)' },
          '50%':       { boxShadow: '0 0 0 4px rgba(85,195,233,0.2)' },
        },
        'slide-in': {
          from: { transform: 'translateY(-8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
