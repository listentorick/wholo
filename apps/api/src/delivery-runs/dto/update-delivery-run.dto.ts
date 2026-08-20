import {
  IsEnum, IsOptional, IsInt, IsString, MaxLength, Min, ValidateIf,
} from 'class-validator';
import { DeliveryRunStatus } from '@prisma/client';

export class UpdateDeliveryRunDto {
  // CAS target — expected current version regardless of which field(s)
  // below are being changed.
  @IsInt()
  @Min(0)
  version: number;

  // Only 'READY' (mark ready) and 'OPEN' (reopen) are meaningful targets —
  // the service rejects a same-state transition with 422, not this DTO,
  // matching house style (reorderRunOrders' exact-match check lives in the
  // service too).
  @IsOptional()
  @IsEnum(DeliveryRunStatus)
  status?: DeliveryRunStatus;

  // Three-state, unlike UpdateDeliveryRouteDto's defaultDriverName: absent
  // = unchanged, null = clear back to "no driver assigned", string = set.
  // A run-level override genuinely needs to be clearable; the route default
  // doesn't need the same treatment today.
  @IsOptional()
  @ValidateIf((o: UpdateDeliveryRunDto) => o.driverName !== null)
  @IsString()
  @MaxLength(100)
  driverName?: string | null;
}
