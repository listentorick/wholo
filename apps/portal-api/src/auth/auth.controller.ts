import { Body, Controller, Get, HttpCode, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsNotEmpty, IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

class ExchangeOrderAsTokenDto {
  @IsString()
  @IsNotEmpty()
  deliveryToken: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    const { token } = req['user'] as { token: string };
    return this.authService.me(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('order-as/exchange')
  @HttpCode(200)
  exchangeOrderAsToken(@Body() dto: ExchangeOrderAsTokenDto, @Req() req: Request) {
    this.logger.log('order-as exchange received');
    const { token } = req['user'] as { token: string };
    return this.authService.exchangeOrderAsToken(dto.deliveryToken, token);
  }
}
