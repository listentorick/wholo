// Single root ESLint config for the whole monorepo (flat config, ESLint 9).
// `pnpm lint` (from the repo root) runs `eslint .` against this — there are no
// per-package lint scripts. Per-glob blocks below express the Nest / Next /
// library-package differences.
//
// Deliberately NON-type-checked (no `parserOptions.project`): far fewer
// violations, ~10x faster, and no dependency on `prisma generate` before lint.
//
// Tuned so the current tree lints with ZERO errors. Genuinely noisy rules are
// set to `warn` (visible, non-failing) rather than fixed en masse — a follow-up
// can ratchet the high-value ones back to `error`. Do not add blanket
// file-level `eslint-disable` comments to keep this green.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';

const NEXT_APPS = ['apps/admin', 'apps/portal', 'apps/www', 'apps/driver'];
const nextGlobs = NEXT_APPS.map((d) => `${d}/**/*.{ts,tsx}`);

export default tseslint.config(
  // (a) Global ignores — generated / build output / vendored trees.
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/build/**',
      '**/.turbo/**',
      '**/*.tsbuildinfo',
      '**/next-env.d.ts',
      '**/prisma/migrations/**',
      'apps/keycloak/**',
      'apps/www/src/lib/og-font.ts', // large generated base64 blob
      '**/.claude/**',
      '**/.impeccable/**',
      '.full-review*/**',
    ],
  },

  // (b) Base JS + TS recommended, scoped to TS files only so the TS parser is
  //     never applied to plain `.js` / `.cjs` config files.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },

  // (c) Node globals for the NestJS apps and the library packages.
  {
    files: ['apps/api/**/*.ts', 'apps/*-api/**/*.ts', 'packages/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  // (d) Next.js apps: React + hooks + Next rules, browser + node globals.
  {
    files: nextGlobs,
    plugins: { react, 'react-hooks': reactHooks, '@next/next': nextPlugin },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '19' } }, // not 'detect' — pnpm root has no react symlink
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules, // React 19 automatic runtime
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/prop-types': 'off', // TypeScript covers this
      'react/no-unescaped-entities': 'off', // noisy, low value in prose-heavy JSX
      'react/display-name': 'warn',
      'react/jsx-key': 'warn', // ratchet back to error once the backlog is clear
      // Crashes ("Pages directory cannot be found") when run from a root config
      // spanning four App-Router apps at different paths.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // (e) Plain CommonJS config files (postcss.config.js etc.).
  {
    files: ['**/*.{js,cjs}'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },

  // (f) Soften genuinely noisy rules repo-wide so the current tree has 0 errors.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Deliberate `export =` / interop workarounds in a few Nest files.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'warn',
    },
  },

  // (g) Tests + config files — test-runner globals, relaxed typing rules.
  //     After block (f) so `any` in specs is not even a warning.
  {
    files: [
      '**/*.{spec,test}.{ts,tsx}',
      '**/test/**',
      '**/__tests__/**',
      '**/*.config.{ts,js,mjs,cjs}',
      '**/jest.*.config.ts',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest, vi: 'readonly', vitest: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // (h) Keep this explicit so a future ESLint default change can't red the build.
  { linterOptions: { reportUnusedDisableDirectives: 'warn' } },
);
