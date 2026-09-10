'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

/** A footer link. Real destinations use next/link; the rest are placeholders
 *  ("fake links" for now) styled the same, per the storefront mock. */
function FooterLink({ href, children }: { href?: string; children: React.ReactNode }) {
  const className = 'block py-1.5 text-sm text-muted transition-colors hover:text-foreground';
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a className={`${className} cursor-pointer`} title="Coming soon">
      {children}
    </a>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2.5 text-xs font-bold uppercase tracking-[0.1em] text-navy">{title}</h4>
      {children}
    </div>
  );
}

/**
 * Global footer for the storefront layout — Pale Stone ground, the Stocdup
 * slogan, four link columns (only "My Suppliers" and "Settings" resolve for
 * now; the rest are placeholders), and a legal line. Structure follows the
 * `Main3` / `Mobile3` storefront artboards.
 */
export function PortalFooter() {
  const { user } = useAuth();

  return (
    <footer className="mt-auto border-t border-border bg-canvas">
      <div className="mx-auto max-w-[1280px] px-4 pb-7 pt-12 md:px-8">
        <p className="text-2xl font-extrabold leading-[1.05] tracking-[-0.045em] text-navy md:text-[34px]">
          Sell more.
          <br />
          Run smoother.
        </p>

        <div className="mt-9 grid grid-cols-2 gap-8 md:grid-cols-4">
          <FooterColumn title="Browse">
            <FooterLink href="/">My Suppliers</FooterLink>
            <FooterLink>Discover</FooterLink>
            <FooterLink>My Orders</FooterLink>
          </FooterColumn>

          <FooterColumn title="Your account">
            <FooterLink href="/settings">Settings</FooterLink>
            <FooterLink>Saved products</FooterLink>
            <FooterLink>Invoices</FooterLink>
            <FooterLink>Delivery addresses</FooterLink>
          </FooterColumn>

          <FooterColumn title="Ordering">
            <FooterLink>How ordering works</FooterLink>
            <FooterLink>Delivery areas</FooterLink>
            <FooterLink>Minimum order</FooterLink>
            <FooterLink>Payment &amp; credit</FooterLink>
          </FooterColumn>

          <FooterColumn title="Stocdup">
            <FooterLink>About Stocdup</FooterLink>
            <FooterLink>Help centre</FooterLink>
            <FooterLink>Contact support</FooterLink>
            <FooterLink>Terms &amp; conditions</FooterLink>
            <FooterLink>Privacy policy</FooterLink>
          </FooterColumn>
        </div>

        <div className="mt-9 flex flex-col gap-2 border-t border-border pt-5 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/stocdup-logo-only.png" alt="" width={20} height={20} draggable={false} />
            &copy; {new Date().getFullYear()} Stocdup
          </span>
          <span>
            {user?.organisationName ? `${user.organisationName} · ` : ''}United Kingdom (GBP £)
          </span>
        </div>
      </div>
    </footer>
  );
}
