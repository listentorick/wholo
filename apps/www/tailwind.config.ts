import type { Config } from 'tailwindcss';

/**
 * Marketing site — shares the Stocdup brand core with apps/portal + apps/admin,
 * but leans the distributor-facing "Dispatch Desk" personality: 6px radius on
 * controls, 8px on containers (Tailwind's default `md`/`lg`), flat with
 * hairline borders. We do NOT zero the radius scale (portal does).
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'hsl(var(--color-primary))',
          fg: 'hsl(var(--color-primary-fg))',
          hover: 'hsl(var(--color-primary-hover))',
        },
        amber: {
          DEFAULT: 'hsl(var(--color-accent))',
          fg: 'hsl(var(--color-accent-fg))',
        },
        navy: {
          DEFAULT: 'hsl(var(--color-navy))',
          raised: 'hsl(var(--color-navy-2))',
        },
        sky: 'hsl(var(--color-sky))',
        canvas: 'hsl(var(--color-canvas))',
        offwhite: 'hsl(var(--color-offwhite))',
        border: 'hsl(var(--color-border))',
        muted: 'hsl(var(--color-muted))',
        foreground: 'hsl(var(--color-text))',
        success: 'hsl(var(--color-success))',
        'on-navy': {
          DEFAULT: 'hsl(var(--color-on-navy))',
          muted: 'hsl(var(--color-on-navy-muted))',
          dim: 'hsl(var(--color-on-navy-dim))',
          soft: 'hsl(var(--color-on-navy-soft))',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        wrap: '1180px',
      },
      letterSpacing: {
        display: '-0.018em',
      },
    },
  },
  plugins: [],
};

export default config;
