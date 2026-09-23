import { Matches } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class DeliveryOutcomesQueryDto {
  @Matches(DATE_ONLY, { message: 'from must be a date (YYYY-MM-DD)' })
  from!: string;

  @Matches(DATE_ONLY, { message: 'to must be a date (YYYY-MM-DD)' })
  to!: string;
}
