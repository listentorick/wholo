import { CanActivate, ExecutionContext, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DeliveryLinksService } from './delivery-links.service';
import { OPEN_DELIVERY_ONLY_KEY } from './open-delivery-only.decorator';

// A delivery-link token is 128 random bits, base64url (ADR-076).
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

// The first thing every delivery-link request meets. Guards run before
// interceptors, so whatever this refuses is refused before FileInterceptor
// (multer) reads a single byte of the body.
//
// - Every route: a missing or malformed token gets 404 straight away, without
//   bothering apps/api.
// - Routes marked @OpenDeliveryOnly() (the photo upload): the BFF can't tell
//   a real link from a made-up one — only apps/api can — so it asks apps/api
//   for the delivery first and lets the body be read only if it exists and
//   is still open. apps/api's 404/410 is passed straight back.
//
// Other routes are forwarded as they are; apps/api checks them itself before
// reading anything. The BFF holds no secret and no database.
@Injectable()
export class DeliveryLinkGuard implements CanActivate {
  constructor(
    private readonly deliveryLinks: DeliveryLinksService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const header = context.switchToHttp().getRequest<Request>().headers['x-delivery-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || !TOKEN_PATTERN.test(token)) throw new NotFoundException();

    const openOnly = this.reflector.getAllAndOverride<boolean>(OPEN_DELIVERY_ONLY_KEY, [context.getHandler(), context.getClass()]);
    if (openOnly) {
      const delivery = await this.deliveryLinks.getOrder(token);
      if (delivery?.state !== 'PENDING') throw new GoneException();
    }
    return true;
  }
}
