import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { DeliveryTokenVerifier } from './delivery-token.verifier';

// The first thing every delivery-link request meets. Guards run before
// interceptors, so a request without a genuine token is refused before
// FileInterceptor (multer) reads a single byte of its body, and before
// anything is forwarded to apps/api.
//
// Same answer as apps/api for every failure — a bare 404 — so a caller can't
// tell a missing token from a malformed or forged one.
@Injectable()
export class DeliveryTokenGuard implements CanActivate {
  constructor(private readonly verifier: DeliveryTokenVerifier) {}

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers['x-delivery-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || !this.verifier.verify(token)) throw new NotFoundException();
    return true;
  }
}
