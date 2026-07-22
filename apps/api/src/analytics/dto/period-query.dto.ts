import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { PERIOD_KEYS, PeriodKey } from '../period';

export class PeriodQueryDto {
  @IsOptional()
  @IsIn(PERIOD_KEYS)
  period?: PeriodKey = 'month';

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
  limit?: number = 10;
}
