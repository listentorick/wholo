import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: 'hsl(var(--color-sidebar-bg))',
          fg: 'hsl(var(--color-sidebar-fg))',
          accent: 'hsl(var(--color-sidebar-accent))',
          border: 'hsl(var(--color-sidebar-border))',
          hover: 'hsl(var(--color-sidebar-hover))',
        },
        topbar: {
          bg: 'hsl(var(--color-topbar-bg))',
        },
        primary: {
          DEFAULT: 'hsl(var(--color-primary))',
          fg: 'hsl(var(--color-primary-fg))',
          hover: 'hsl(var(--color-primary-hover))',
        },
        surface: 'hsl(var(--color-surface))',
        border: 'hsl(var(--color-border))',
        muted: 'hsl(var(--color-muted))',
        text: 'hsl(var(--color-text))',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      width: {
        sidebar: 'var(--sidebar-width)',
      },
    },
  },
  plugins: [],
};

export default config;
