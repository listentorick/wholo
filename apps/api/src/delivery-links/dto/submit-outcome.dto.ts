import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryDropMethod, DeliveryOutcomeType, UnableToDeliverReason } from '@prisma/client';

// signature_pad stroke-vector proof (pad.toData()). Stored verbatim in the
// `signature` jsonb column — never a raster image. width/height are the
// capture-time canvas CSS pixel size, needed to replay the strokes later.
export class SignatureDto {
  @ApiProperty({ enum: ['signature_pad'] })
  @Equals('signature_pad')
  format: 'signature_pad';

  @ApiProperty()
  @IsInt()
  @Min(1)
  version: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(10000)
  width: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(10000)
  height: number;

  // Opaque signature_pad PointGroup[] — not introspected here beyond a size
  // cap; the service additionally rejects an oversized serialised payload.
  @ApiProperty({ type: [Object] })
  @IsArray()
  @ArrayMaxSize(2000)
  strokes: unknown[];
}

// Only DELIVERED and UNABLE_TO_DELIVER are accepted this round — Increment 2/3
// scope. PARTIALLY_DELIVERED exists on the DeliveryOutcomeType enum (reserved
// for a future increment) but is rejected at the service layer.
export class SubmitOutcomeDto {
  @ApiProperty({ enum: DeliveryOutcomeType })
  @IsEnum(DeliveryOutcomeType)
  outcome: DeliveryOutcomeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ enum: UnableToDeliverReason })
  @IsOptional()
  @IsEnum(UnableToDeliverReason)
  unableReason?: UnableToDeliverReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  unableReasonNote?: string;

  // Delivered-only. Required by the service when outcome === DELIVERED;
  // HANDED_TO_PERSON additionally requires recipientName + signature.
  @ApiPropertyOptional({ enum: DeliveryDropMethod })
  @IsOptional()
  @IsEnum(DeliveryDropMethod)
  dropMethod?: DeliveryDropMethod;

  @ApiPropertyOptional({ type: SignatureDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SignatureDto)
  signature?: SignatureDto;

  // Device-reported capture time (advisory) — distinct from the server's
  // recordedAt. PRD §11.
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;
}
