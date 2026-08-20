import {
  IsInt, IsNotEmpty, IsOptional, IsString, Min,
} from 'class-validator';

export class AssignOrderToRunDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  // Destination run's last-known version — CAS target.
  @IsInt()
  @Min(0)
  version: number;

  // Present only on a cross-run move (omitted when assigning a
  // previously-unassigned order); used to CAS the source allocation row
  // itself (activeOrderId + runId), not a version.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourceRunId?: string;

  // 1-based target position in the destination run; omitted = append.
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;
}
