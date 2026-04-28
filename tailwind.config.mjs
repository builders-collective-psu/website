import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F4F1EA',
        'paper-2': '#ECE7DA',
        ink: '#0B1220',
        'ink-2': '#1A2238',
        navy: '#0E1E40',
        accent: '#FF4D1F',
        muted: '#6B6356',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
        serif: ['"Instrument Serif"', ...defaultTheme.fontFamily.serif],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.02em',
        meta: '0.16em',
        wide2: '0.14em',
        wide3: '0.16em',
        wide4: '0.18em',
      },
      fontSize: {
        meta: ['11px', { lineHeight: '1.2', letterSpacing: '0.16em' }],
        stat: ['64px', { lineHeight: '1', letterSpacing: '-0.04em' }],
      },
      borderRadius: {
        none: '0',
      },
      maxWidth: {
        wrap: '1440px',
      },
    },
  },
  corePlugins: {
    preflight: true,
  },
  plugins: [],
};
