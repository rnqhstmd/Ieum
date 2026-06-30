import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: 'var(--c-surface)',
        deep: 'var(--c-deep)',
        hover: 'var(--c-hover)',
        hair: {
          DEFAULT: 'var(--c-hair)',
          2: 'var(--c-hair-2)',
          3: 'var(--c-hair-3)',
        },
        ink: 'var(--c-text)',
        body: 'var(--c-body)',
        dim: 'var(--c-dim)',
        faint: 'var(--c-faint)',
        fainter: 'var(--c-fainter)',
        label: 'var(--c-label)',
        accent: 'var(--c-accent)',
        ok: 'var(--c-ok)',
        warn: 'var(--c-warn)',
        danger: 'var(--c-error)',
        fill: {
          a: 'var(--c-fill-a)',
          b: 'var(--c-fill-b)',
        },
      },
      fontFamily: {
        sans: ['Pretendard', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
