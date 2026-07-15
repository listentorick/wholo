import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class KeycloakIdentityGuard extends AuthGuard('keycloak-identity') {}
