import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class OpenSupportAccessDto {
  @IsString()
  @MinLength(1)
  distributorId: string;

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}
