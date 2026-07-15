import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { KeycloakJwtAuthGuard } from './guards/keycloak-jwt-auth.guard';
import type { KeycloakPrincipal } from './strategies/keycloak-jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '') ?? '';
    return this.authService.me(token);
  }

  // Signature-only guard: must answer for identities with no Wholo user yet.
  @UseGuards(KeycloakJwtAuthGuard)
  @Get('session')
  session(@Req() req: Request & { user: KeycloakPrincipal }) {
    return this.authService.session(req.user.token ?? '', req.user);
  }
}
