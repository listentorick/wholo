import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { KeycloakJwtAuthGuard } from '../auth/guards/keycloak-jwt-auth.guard';
import type { KeycloakPrincipal } from '../auth/strategies/keycloak-jwt.strategy';
import { OnboardingService } from './onboarding.service';
import { CreateDistributorDto } from './dto/create-distributor.dto';

@Controller('onboarding')
export class OnboardingController {
  constructor(private service: OnboardingService) {}

  // Signature-only guard: the caller has no Wholo user until this call succeeds.
  @UseGuards(KeycloakJwtAuthGuard)
  @Post('distributor')
  createDistributor(@Req() req: Request & { user: KeycloakPrincipal }, @Body() dto: CreateDistributorDto) {
    return this.service.createDistributor(req.user.token ?? '', dto);
  }
}
