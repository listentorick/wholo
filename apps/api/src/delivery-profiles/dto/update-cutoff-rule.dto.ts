import { IsOptional, IsInt, Min, Max, IsString, Matches } from 'class-validator';

export class UpdateCutoffRuleDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'cutoffTime must be in HH:MM format' })
  cutoffTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  processingDaysBeforeDelivery?: number;
}
