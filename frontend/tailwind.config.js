/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'IBM Plex Sans', 'sans-serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'monospace'],
      },
      colors: {
        bg:      'var(--bg)',
        bg1:     'var(--bg1)',
        bg2:     'var(--bg2)',
        bg3:     'var(--bg3)',
        border:  'var(--border)',
        border2: 'var(--border2)',
        cyan:    'var(--cyan)',
        green:   'var(--green)',
        red:     'var(--red)',
        amber:   'var(--amber)',
        text:    'var(--text)',
        text2:   'var(--text2)',
        text3:   'var(--text3)',
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
};
