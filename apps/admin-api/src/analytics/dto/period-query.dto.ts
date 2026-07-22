import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

const PERIOD_KEYS = ['today', 'week', 'month', 'rolling7', 'rolling30', 'rolling90', 'rolling365', 'custom'] as const;
type PeriodKey = (typeof PERIOD_KEYS)[number];

export class PeriodQueryDto {
  @IsOptional()
  @IsIn(PERIOD_KEYS)
  period?: PeriodKey;

  @ValidateIf((o: PeriodQueryDto) => o.period === 'custom')
  @IsISO8601({ strict: true }, { message: 'start must be an ISO date (YYYY-MM-DD) when period=custom' })
  start?: string;

  @ValidateIf((o: PeriodQueryDto) => o.period === 'custom')
  @IsISO8601({ strict: true }, { message: 'end must be an ISO date (YYYY-MM-DD) when period=custom' })
  end?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
