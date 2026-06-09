import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class AddProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  productIds: string[];
}
