import { Matches } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// The api validates the window properly; this declares the fields so the
// BFF's whitelisting ValidationPipe forwards them, and rejects the obviously
// malformed before a round trip.
export class DeliveryOutcomesQueryDto {
  @Matches(DATE_ONLY, { message: 'from must be a date (YYYY-MM-DD)' })
  from!: string;

  @Matches(DATE_ONLY, { message: 'to must be a date (YYYY-MM-DD)' })
  to!: string;
}
