import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.authService.me(token);
  }
}
