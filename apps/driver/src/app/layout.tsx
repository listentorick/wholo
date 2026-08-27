import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stocdup Driver',
  description: 'Stocdup driver delivery confirmation',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Stocdup Driver',
  },
};

export const viewport: Viewport = {
  themeColor: '#1565FF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
