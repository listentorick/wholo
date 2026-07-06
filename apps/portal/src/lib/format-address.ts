import type { AddressSnapshot } from '@wholo/types';

/** Single-line display form of an address: blank parts filtered, comma-joined. */
export function formatAddress(address: AddressSnapshot | null | undefined): string {
  if (!address) return '';
  return [address.line1, address.line2, address.city, address.state, address.postcode, address.country]
    .filter(Boolean)
    .join(', ');
}
