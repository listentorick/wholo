import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { NotificationProvider } from '@/lib/notification-context';

export const metadata: Metadata = {
  title: 'Stocdup Admin',
  description: 'Stocdup distributor administration',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Stocdup Distributor',
  },
};

export const viewport: Viewport = {
  themeColor: '#1565FF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <NotificationProvider>{children}</NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
