import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateDeliveryRunDto {
  @IsString()
  @IsNotEmpty()
  routeId: string;

  // Date-only (YYYY-MM-DD). Deliberately stricter than @IsDateString(): this
  // value feeds the @@unique([distributorId, routeId, deliveryDate]) lookup
  // and getDay's `new Date(`${date}T00:00:00.000Z`)` board assembly — a full
  // ISO datetime would silently miss the @db.Date row.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'deliveryDate must be a YYYY-MM-DD date' })
  deliveryDate: string;
}
