import { Controller, Get, Query, Req, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrganisationType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryAvailabilityService } from './delivery-availability.service';
import { PrismaService } from '../prisma/prisma.service';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Delivery')
@ApiBearerAuth()
@Controller('delivery')
@UseGuards(JwtAuthGuard)
export class DeliveryAvailabilityController {
  constructor(
    private readonly service: DeliveryAvailabilityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('available-dates')
  @ApiOperation({ summary: 'Get available delivery dates for the authenticated trade customer' })
  async getAvailableDates(
    @Query('distributorSlug') distributorSlug: string,
    @Req() req: RequestWithUser,
  ) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { slug: distributorSlug, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    return this.service.getAvailableDates(distributor.id, req.user.organisationId);
  }
}
