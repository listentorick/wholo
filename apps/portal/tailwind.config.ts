import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      borderRadius: {
        none: '0',
        sm:   '0',
        DEFAULT: '0',
        md:   '0',
        lg:   '0',
        xl:   '0',
        '2xl': '0',
        '3xl': '0',
      },
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
        accent: {
          DEFAULT: 'hsl(var(--color-primary))',
          hover:   'hsl(var(--color-primary-hover))',
          light:   'hsl(var(--color-primary-light))',
          subtle:  'hsl(var(--color-primary-subtle))',
        },
        amber: {
          DEFAULT: 'hsl(var(--color-accent))',
          fg:      'hsl(var(--color-accent-fg))',
          light:   'hsl(var(--color-accent-light))',
          border:  'hsl(var(--color-accent-border))',
        },
        highlight: {
          DEFAULT: 'hsl(var(--color-highlight))',
        },
        border: 'hsl(var(--color-border))',
        muted:  'hsl(var(--color-muted))',
        foreground: {
          DEFAULT:   'hsl(var(--color-text))',
          secondary: '#4B5563',
          tertiary:  '#6B7280',
        },
        surface: {
          DEFAULT:   'hsl(var(--color-surface))',
          highlight: 'hsl(var(--color-highlight-light))',
          hover:     'hsl(var(--color-canvas))',
        },
        canvas: 'hsl(var(--color-canvas))',
        error:   '#DC2626',
        success: '#16A34A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            a: { color: 'hsl(var(--color-primary))' },
            'a:hover': { color: 'hsl(var(--color-primary-hover))' },
          },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
