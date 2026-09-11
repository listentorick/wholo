'use client';

import ReactMarkdown from 'react-markdown';
import { useDistributor } from '@/lib/distributor-context';
import { Eyebrow } from '@/components/Eyebrow';
import { RelationshipCta } from './RelationshipCta';

/**
 * "About" block of the storefront — scroll target for the About tab. Content
 * lifted from the old About page's `AboutBox`: tagline (brand-voice cobalt),
 * `aboutText` markdown, and the relationship CTA. Reads the distributor from
 * context, and always renders its `<section>` shell so the scroll-spy has a
 * target even before the distributor resolves.
 */
export function AboutSection() {
  const { distributor, relationshipStatus } = useDistributor();

  return (
    <section
      id="about"
      data-scroll-section
      className="mx-auto w-full max-w-[1280px] scroll-mt-[var(--sticky-stack-h,0px)] border-t border-border bg-surface px-4 pb-0 pt-7 md:border-0 md:bg-transparent md:px-8 md:pb-0 md:pt-8"
    >
      {/* On mobile the About + Delivery sections share one white block with a
          single full-width top border (per the iteration-mobile mock); the card
          chrome only comes back at md. */}
      <div className="md:rounded-lg md:border md:border-border md:bg-surface md:p-6 md:shadow-sm">
        {distributor && (
          <>
            <Eyebrow className="mb-3">About us</Eyebrow>

            {distributor.tagline && (
              <p className="text-sm font-medium text-primary">{distributor.tagline}</p>
            )}

            {distributor.aboutText && (
              <div className="prose prose-sm prose-gray mt-4 max-w-[68ch]">
                <ReactMarkdown>{distributor.aboutText}</ReactMarkdown>
              </div>
            )}

            <RelationshipCta
              distributorName={distributor.name}
              relationshipStatus={relationshipStatus}
              variant="section"
            />
          </>
        )}
      </div>
    </section>
  );
}
