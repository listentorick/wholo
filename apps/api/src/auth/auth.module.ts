import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { KeycloakIdentityStrategy } from './strategies/keycloak-identity.strategy';
import { UsersModule } from '../users/users.module';
import { SupportAccessReader } from './support-access-reader.service';

@Module({
  imports: [UsersModule, PassportModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, KeycloakIdentityStrategy, SupportAccessReader],
})
export class AuthModule {}
