'use client';

import type { ReactNode } from 'react';
import { formatMoney, type DistributorInfo } from '@wholo/types';
import type { DeliveryParts } from '@/lib/hooks/use-delivery-parts';
import { formatProcessingDays } from '@/lib/format-processing-days';
import { Eyebrow } from '@/components/Eyebrow';
import { TruckIcon, MapPinIcon, PhoneIcon, MailIcon, WalletIcon, CalendarIcon } from './icons';

interface Props {
  distributor: DistributorInfo;
  effectiveMinSpend: number | null;
  deliveryParts: DeliveryParts | null;
}

function StatTile({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div>
        <p className="text-lg font-semibold leading-tight text-foreground">{value}</p>
        <p className="mt-0.5 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

/**
 * "Delivery & terms" block — scroll target for that tab. Merges the old About
 * page's `KeyInfo` (minimum spend / processing days / delivery cut-off) and
 * `GetInTouch` (address / phone / email) into one section.
 */
export function DeliveryTermsSection({ distributor, effectiveMinSpend, deliveryParts }: Props) {
  const minSpend = effectiveMinSpend !== null ? formatMoney(effectiveMinSpend, distributor.currencyCode) : null;
  const processingLabel = formatProcessingDays(distributor.processingDays);

  const addressParts = [
    distributor.addressLine1,
    distributor.addressLine2,
    [distributor.addressCity, distributor.addressState, distributor.addressPostcode].filter(Boolean).join(' '),
    distributor.addressCountry,
  ].filter(Boolean);
  const hasContact = addressParts.length > 0 || distributor.phone || distributor.email;

  return (
    <section
      id="delivery"
      data-scroll-section
      className="mx-auto w-full max-w-[1280px] scroll-mt-[var(--sticky-stack-h,0px)] px-4 pb-8 pt-6 md:px-8 md:py-8"
    >
      {/* Card chrome only on desktop — on mobile this continues the borderless
          block started by the About section. */}
      <div className="grid gap-6 md:grid-cols-2 md:rounded-lg md:border md:border-border md:bg-surface md:p-6 md:shadow-sm">
        <div>
          <Eyebrow className="mb-4">Delivery &amp; terms</Eyebrow>
          <div className="flex flex-col gap-4">
            {minSpend && <StatTile icon={<WalletIcon />} value={minSpend} label="Minimum spend" />}
            {processingLabel && (
              <StatTile icon={<CalendarIcon />} value={processingLabel} label="Orders processed" />
            )}
            {deliveryParts && (
              <div className="flex items-start gap-3 text-sm text-muted">
                <span className="mt-0.5 text-muted">
                  <TruckIcon />
                </span>
                <span>
                  Order by <strong className="font-semibold text-foreground">{deliveryParts.time}</strong>
                  {', '}
                  {deliveryParts.cutoffDayLabel} for delivery on{' '}
                  <strong className="font-semibold text-foreground">
                    {deliveryParts.dayName} {deliveryParts.dayOrdinal}
                  </strong>
                </span>
              </div>
            )}
            {!minSpend && !processingLabel && !deliveryParts && (
              <p className="text-sm text-muted">Delivery details are shown once you&rsquo;re connected.</p>
            )}
          </div>
        </div>

        {hasContact && (
          <div className="md:border-l md:border-border md:pl-6">
            <Eyebrow className="mb-4">Get in touch</Eyebrow>
            <ul className="flex flex-col gap-3 text-sm">
              {addressParts.length > 0 && (
                <li className="flex items-start gap-2.5 text-muted">
                  <MapPinIcon />
                  <span className="leading-snug">
                    {addressParts.map((part, i) => (
                      <span key={i}>
                        {part}
                        {i < addressParts.length - 1 ? <br /> : null}
                      </span>
                    ))}
                  </span>
                </li>
              )}
              {distributor.phone && (
                <li className="flex items-start gap-2.5">
                  <span className="text-muted">
                    <PhoneIcon />
                  </span>
                  <a href={`tel:${distributor.phone}`} className="text-foreground transition-colors hover:text-accent">
                    {distributor.phone}
                  </a>
                </li>
              )}
              {distributor.email && (
                <li className="flex items-start gap-2.5">
                  <span className="text-muted">
                    <MailIcon />
                  </span>
                  <a
                    href={`mailto:${distributor.email}`}
                    className="break-all text-foreground transition-colors hover:text-accent"
                  >
                    {distributor.email}
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
