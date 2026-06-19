import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';

@Injectable()
export class AuthService {
  constructor(private api: ApiClientService) {}

  me(token: string) {
    return this.api.get('/auth/me', token);
  }
}
