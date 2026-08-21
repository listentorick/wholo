import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: 'Stocdup Portal',
  description: 'Stocdup trade customer portal',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Stocdup',
  },
};

export const viewport: Viewport = {
  themeColor: '#1565FF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
