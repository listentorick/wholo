import type { Metadata } from 'next';
import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';
import { Section } from '@/components/layout/Section';
import { DisplayHeading } from '@/components/ui/DisplayHeading';

export const metadata: Metadata = {
  title: 'Privacy notice',
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <Section band="white">
          <div className="flex max-w-[680px] flex-col gap-5">
            <DisplayHeading className="text-navy">Privacy notice</DisplayHeading>
            <p className="text-[16px] text-muted">
              [Placeholder: the full privacy notice is to be supplied by Stocdup.]
            </p>
            <p className="text-[16px] text-muted">
              In short: if you register your interest, we use the details you give
              us (your name, work email, business name, role and anything you tell
              us about how you work) only to contact you about Stocdup and to
              decide whether the product is a fit for your business. We do not
              sell your details or use them for unrelated marketing. Contact{' '}
              <a
                href="mailto:privacy@stocdup.com"
                className="text-primary underline hover:text-primary-hover"
              >
                privacy@stocdup.com
              </a>{' '}
              to ask what we hold or to have it deleted.
            </p>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
