import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../api-client/api-client.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private api: ApiClientService) {}

  login(dto: LoginDto) {
    return this.api.post('/auth/login', null, dto);
  }

  me(token: string) {
    return this.api.get('/auth/me', token);
  }
}
