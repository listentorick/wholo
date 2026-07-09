import { IsNotEmpty, IsString } from 'class-validator';

export class MatchProductDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;
}
