import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

// Thin, unauthenticated passthrough to apps/api's public delivery-links endpoints.
@Injectable()
export class DeliveryLinksService {
  constructor(private api: ApiClientService) {}

  getOrder(token: string) {
    return this.api.get('/delivery-links', { 'X-Delivery-Token': token });
  }

  submitOutcome(token: string, dto: unknown) {
    return this.api.post('/delivery-links/outcome', { 'X-Delivery-Token': token }, dto);
  }

  uploadPhoto(token: string, file: Express.Multer.File) {
    const form = new FormData();
    // Fixed filename — the client's original filename is never forwarded (it is
    // unused downstream and there is no reason to pass a user-controlled string
    // through). apps/api derives everything from the verified token.
    form.append('photo', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), 'delivery-photo');
    return this.api.postMultipart('/delivery-links/photos', { 'X-Delivery-Token': token }, form);
  }

  deletePhoto(token: string, photoId: string) {
    return this.api.delete(`/delivery-links/photos/${encodeURIComponent(photoId)}`, { 'X-Delivery-Token': token });
  }
}
