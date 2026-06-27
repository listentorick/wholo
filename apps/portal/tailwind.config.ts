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
        accent: {
          DEFAULT: '#D97036',
          hover:   '#C4622A',
          light:   '#FDF0E8',
          subtle:  '#FEF3EC',
        },
        border: '#E5E7EB',
        muted:  '#9CA3AF',
        foreground: {
          DEFAULT:   '#1A1A1A',
          secondary: '#4B5563',
          tertiary:  '#6B7280',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          sidebar: '#F9F8F6',
          hover:   '#F3F4F6',
        },
        error:   '#DC2626',
        success: '#16A34A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            a: { color: '#D97036' },
            'a:hover': { color: '#C4622A' },
          },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
