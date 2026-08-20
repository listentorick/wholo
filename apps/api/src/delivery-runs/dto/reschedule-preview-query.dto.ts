import { IsDateString } from 'class-validator';

export class ReschedulePreviewQueryDto {
  @IsDateString()
  date: string;
}
