'use client';

import ReactMarkdown from 'react-markdown';
import type { DistributorInfo } from '@wholo/types';
import type { RelationshipStatus } from '@/lib/distributor-context';
import { Eyebrow } from '@/components/Eyebrow';
import { RelationshipCta } from './RelationshipCta';

interface Props {
  distributor: DistributorInfo;
  relationshipStatus: RelationshipStatus | null;
}

/**
 * "About" block of the storefront — scroll target for the About tab. Content
 * lifted from the old About page's `AboutBox`: tagline (brand-voice cobalt),
 * `aboutText` markdown, and the relationship CTA.
 */
export function AboutSection({ distributor, relationshipStatus }: Props) {
  return (
    <section
      id="about"
      data-scroll-section
      className="mx-auto w-full max-w-[1280px] scroll-mt-[var(--sticky-stack-h,0px)] px-4 py-8 md:px-8"
    >
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
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
      </div>
    </section>
  );
}
