import { IsArray, IsString } from 'class-validator';

export class SyncProductsDto {
  @IsArray()
  @IsString({ each: true })
  productIds: string[];
}
