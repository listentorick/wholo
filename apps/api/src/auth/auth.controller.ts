import { BadRequestException, Controller, Get, UseGuards, Req, Query } from '@nestjs/common';
import { OrganisationType } from '@prisma/client';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequestUser } from './ops-session';

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
  @ApiQuery({ name: 'organisationId', required: false, description: 'Scope the profile to this organisation (a membership or an active support grant)' })
  @ApiQuery({
    name: 'organisationType',
    required: false,
    enum: OrganisationType,
    description: 'Without organisationId: prefer one of the caller\'s own memberships of this kind',
  })
  @ApiForbiddenResponse({ description: 'organisationId is not one the caller may act in' })
  @ApiBadRequestResponse({ description: 'organisationType is not a known kind of organisation' })
  async me(
    @Req() req: Request,
    @Query('organisationId') organisationId?: string,
    @Query('organisationType') organisationType?: string,
  ) {
    const user = req.user as RequestUser;
    return this.authService.getProfile(user.sub, {
      organisationId: organisationId || undefined,
      organisationType: this.parseType(organisationType),
      memberships: user.memberships,
    });
  }

  private parseType(value: string | undefined): OrganisationType | undefined {
    if (!value) return undefined;
    if (!(Object.values(OrganisationType) as string[]).includes(value)) {
      throw new BadRequestException('Unknown organisationType');
    }
    return value as OrganisationType;
  }
}
