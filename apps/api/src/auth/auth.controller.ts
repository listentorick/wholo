import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiOkResponse, ApiUnauthorizedResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user profile' })
  @ApiOkResponse({ description: 'Current user profile' })
  @ApiUnauthorizedResponse({ description: 'Token missing or expired' })
  async me(@Req() req: Request) {
    return this.authService.getProfile((req.user as any).sub);
  }
}
