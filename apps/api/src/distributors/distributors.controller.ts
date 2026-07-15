import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { KeycloakIdentityGuard } from '../auth/guards/keycloak-identity.guard';
import type { KeycloakIdentity } from '../auth/strategies/keycloak-identity.strategy';
import { DistributorsService } from './distributors.service';
import { CreateDistributorDto } from './dto/create-distributor.dto';

@Controller('distributors')
export class DistributorsController {
  constructor(private service: DistributorsService) {}

  // Self-service onboarding: the caller is a verified Keycloak identity that
  // may not have a Wholo user yet, so this uses the identity guard (signature
  // + email_verified only), not JwtAuthGuard.
  @UseGuards(KeycloakIdentityGuard)
  @Post()
  create(@Request() req: { user: KeycloakIdentity }, @Body() dto: CreateDistributorDto) {
    return this.service.createForIdentity(req.user, dto);
  }
}
