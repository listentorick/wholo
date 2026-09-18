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
    token: string,
  ): Promise<unknown> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
    form.append('assetType', assetType);
    form.append('entityId', entityId);
    return this.api.postMultipart(`/distributors/${distributorId}/asset-images`, token, form);
  }

  list(distributorId: string, assetType: string, entityId: string, token: string): Promise<unknown> {
    return this.api.get(
      `/distributors/${distributorId}/asset-images?assetType=${encodeURIComponent(assetType)}&entityId=${encodeURIComponent(entityId)}`,
      token,
    );
  }

  delete(distributorId: string, imageId: string, token: string): Promise<unknown> {
    return this.api.delete(`/distributors/${distributorId}/asset-images/${imageId}`, token);
  }

  reorder(
    distributorId: string,
    assetType: string,
    entityId: string,
    imageIds: string[],
    token: string,
  ): Promise<unknown> {
    return this.api.put(`/distributors/${distributorId}/asset-images/reorder`, token, {
      assetType,
      entityId,
      imageIds,
    });
  }
}
