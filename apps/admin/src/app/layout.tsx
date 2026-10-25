import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { NotificationProvider } from '@/lib/notification-context';
import { NavBadgesProvider } from '@/lib/nav-badges-context';
import { SupportPresenceProvider } from '@/lib/support-presence-context';

// The Ops build of this app (ADR-078) — NEXT_PUBLIC_APP_MODE is inlined at build time.
const isOps = process.env.NEXT_PUBLIC_APP_MODE === 'ops';

export const metadata: Metadata = {
  title: isOps ? 'Stocdup Ops' : 'Stocdup Admin',
  description: isOps ? 'Stocdup platform operations' : 'Stocdup distributor administration',
  // The Ops build's amber hexagon, so an Ops tab is told apart at a glance.
  ...(isOps && { icons: { icon: '/ops-icon.svg' } }),
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
    <html lang="en" data-app={isOps ? 'ops' : undefined}>
      <body>
        <AuthProvider>
          <NotificationProvider>
            <NavBadgesProvider>
              <SupportPresenceProvider>{children}</SupportPresenceProvider>
            </NavBadgesProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
