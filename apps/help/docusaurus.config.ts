import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { readAudiences } from './src/audiences';

// Stocdup help site (help.stocdup.com), ADR-080.
// Content lives in documentation/docs, where the scenario-docs skill writes its
// generated how-to pages; this app only builds and styles it. HELP_SITE_URL is
// baked in at build time (canonical URLs, sitemap): the live image gets
// https://help.stocdup.com from CI, local builds default to localhost.
const siteUrl = process.env.HELP_SITE_URL || 'http://localhost:3060';

const config: Config = {
  title: 'Stocdup Help',
  tagline: 'How to get things done in Stocdup',
  favicon: 'img/favicon.png',
  url: siteUrl,
  baseUrl: '/',
  trailingSlash: false,

  // A broken link or image fails the build, so a bad page never ships.
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    hooks: { onBrokenMarkdownLinks: 'throw', onBrokenMarkdownImages: 'throw' },
  },

  i18n: { defaultLocale: 'en-GB', locales: ['en-GB'] },

  presets: [
    [
      'classic',
      {
        docs: {
          path: '../../documentation/docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        docsRouteBasePath: '/',
        docsDir: '../../documentation/docs',
        indexBlog: false,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: 'Help',
      logo: {
        alt: 'Stocdup',
        src: 'img/logo-mark.png',
        srcDark: 'img/logo-mark-white.png',
      },
      // One item per audience, opening that audience's own sidebar.
      items: [
        ...readAudiences().map((a) => ({
          type: 'docSidebar' as const,
          sidebarId: a.id,
          label: a.label,
          position: 'left' as const,
        })),
        { href: 'https://www.stocdup.com', label: 'stocdup.com', position: 'right' },
      ],
    },
    footer: {
      style: 'light',
      copyright: `© ${new Date().getFullYear()} Stocdup`,
    },
    prism: {},
  } satisfies Preset.ThemeConfig,
};

export default config;
