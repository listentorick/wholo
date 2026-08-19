import {
  IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength,
} from 'class-validator';

export class CreateDeliveryRouteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultDriverName?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
