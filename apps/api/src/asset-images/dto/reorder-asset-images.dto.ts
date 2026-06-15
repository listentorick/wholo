import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class ReorderAssetImagesDto {
  @IsString()
  @IsNotEmpty()
  assetType: string;

  @IsString()
  @IsNotEmpty()
  entityId: string;

  @IsArray()
  @IsString({ each: true })
  imageIds: string[];
}
