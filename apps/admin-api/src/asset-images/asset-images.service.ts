import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class AssetImagesService {
  constructor(private readonly api: ApiClientService) {}

  upload(
    distributorId: string,
    assetType: string,
    entityId: string,
    file: Express.Multer.File,
  ): Promise<unknown> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
    form.append('assetType', assetType);
    form.append('entityId', entityId);
    return this.api.postMultipart('/admin/asset-images', distributorId, form);
  }

  list(distributorId: string, assetType: string, entityId: string): Promise<unknown> {
    return this.api.get(
      `/admin/asset-images?assetType=${encodeURIComponent(assetType)}&entityId=${encodeURIComponent(entityId)}`,
      distributorId,
    );
  }

  delete(distributorId: string, imageId: string): Promise<unknown> {
    return this.api.delete(`/admin/asset-images/${imageId}`, distributorId);
  }

  reorder(
    distributorId: string,
    assetType: string,
    entityId: string,
    imageIds: string[],
  ): Promise<unknown> {
    return this.api.put('/admin/asset-images/reorder', distributorId, {
      assetType,
      entityId,
      imageIds,
    });
  }
}
