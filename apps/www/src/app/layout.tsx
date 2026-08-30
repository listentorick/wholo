import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { MotionProvider } from '@/components/motion/MotionProvider';

const inter = localFont({
  src: './fonts/InterVariable.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.stocdup.com';
const TITLE = 'Stocdup: Sell more. Run smoother.';
const DESCRIPTION =
  'Stocdup is the UK-native wholesale platform for independent food and drink distributors: win new customers, grow existing accounts and connect ordering, accounting and delivery.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · Stocdup' },
  description: DESCRIPTION,
  applicationName: 'Stocdup',
  keywords: [
    'UK wholesale software',
    'wholesale platform',
    'drinks distributor software',
    'food and drink wholesaler',
    'trade ordering',
    'proof of delivery',
    'independent distributor',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Stocdup',
    url: SITE_URL,
    title: TITLE,
    description:
      'The UK-native wholesale platform for independent food and drink distributors.',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description:
      'The UK-native wholesale platform for independent food and drink distributors.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0B1D3A',
  colorScheme: 'light',
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Stocdup',
  url: SITE_URL,
  description: DESCRIPTION,
  logo: `${SITE_URL}/logo-mark.png`,
  areaServed: 'GB',
  slogan: 'Sell more. Run smoother.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={inter.variable}>
      <body>
        <a
          href="#main"
          className="sr-only rounded-md bg-primary px-4 py-2 font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- static, trusted, first-party structured data
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </body>
    </html>
  );
}
