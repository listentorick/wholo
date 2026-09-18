import { IsString, IsInt, Min } from 'class-validator';

export class UpsertCartItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(0)
  quantity: number;
}
