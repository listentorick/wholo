import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UnassignOrderQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version: number;
}
