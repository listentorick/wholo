import { IsString, IsOptional } from 'class-validator';

export class AssignPriceListDto {
  @IsString()
  @IsOptional()
  priceListId: string | null;
}
