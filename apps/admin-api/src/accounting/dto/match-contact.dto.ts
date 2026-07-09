import { IsNotEmpty, IsString } from 'class-validator';

export class MatchContactDto {
  @IsString()
  @IsNotEmpty()
  tradeRelationshipId!: string;
}
