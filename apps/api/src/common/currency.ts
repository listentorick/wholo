import { Prisma } from '@prisma/client';

/** Valid ISO 4217 currency codes, used to validate the currency fields on
 * DistributorSettings and price lists — mirrors the IANA_TIMEZONES pattern. */
export const ISO_CURRENCIES = Intl.supportedValuesOf('currency');

/**
 * ISO 4217 minor-unit exponent for a currency: GBP/USD/EUR → 2, JPY → 0,
 * BHD/KWD → 3. Read from the runtime's ICU data via Intl rather than a
 * hand-maintained table so it can't drift. Falls back to 2 for an
 * unrecognised code (currency codes on DistributorSettings are already
 * ISO-validated against ISO_CURRENCIES, so this is belt-and-braces).
 */
export function currencyMinorUnitExponent(currencyCode: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode })
        .resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * Convert a money amount to an integer number of minor currency units
 * (127.50 GBP → 12750, 1250 JPY → 1250). Rounds half-up. An order total is
 * always well within Number.MAX_SAFE_INTEGER once expressed in minor units.
 */
export function toMinorUnits(
  amount: Prisma.Decimal | string | number,
  currencyCode: string,
): number {
  const exponent = currencyMinorUnitExponent(currencyCode);
  return new Prisma.Decimal(amount)
    .times(new Prisma.Decimal(10).pow(exponent))
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}
