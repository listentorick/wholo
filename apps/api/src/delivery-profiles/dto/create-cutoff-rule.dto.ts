import { IsInt, Min, Max, IsString, Matches } from 'class-validator';

export class CreateCutoffRuleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'cutoffTime must be in HH:MM format' })
  cutoffTime: string;

  @IsInt()
  @Min(0)
  processingDaysBeforeDelivery: number;
}
