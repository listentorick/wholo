import { IsNotEmpty, IsString } from 'class-validator';

export class MatchTaxTypeDto {
  @IsString()
  @IsNotEmpty()
  taxTypeId!: string;
}
