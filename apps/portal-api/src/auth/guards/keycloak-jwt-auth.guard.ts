import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class KeycloakJwtAuthGuard extends AuthGuard('keycloak-jwt') {}
