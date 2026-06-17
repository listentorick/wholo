import { IsString, IsOptional } from 'class-validator';

export class AssignDeliveryProfileDto {
  @IsOptional()
  @IsString()
  deliveryProfileId: string | null;
}
