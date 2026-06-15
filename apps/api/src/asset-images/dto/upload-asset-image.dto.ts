import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UploadAssetImageDto {
  @ApiProperty({ description: 'Asset type identifier, e.g. product-image' })
  @IsString()
  @IsNotEmpty()
  assetType: string;

  @ApiProperty({ description: 'ID of the entity this image belongs to' })
  @IsString()
  @IsNotEmpty()
  entityId: string;
}
