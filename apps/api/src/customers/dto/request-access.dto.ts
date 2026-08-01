import { IsBoolean } from 'class-validator';

export class RequestAccessDto {
  @IsBoolean()
  recentContact: boolean;
}
