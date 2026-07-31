import { Controller, Get, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrganisationType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryAvailabilityService } from './delivery-availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActingCustomerId } from '../order-as/acting-customer.decorator';

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
    @ActingCustomerId() customerId: string,
  ) {
    const distributor = await this.prisma.organisation.findFirst({
      where: { slug: distributorSlug, type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      select: { id: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    return this.service.getAvailableDates(distributor.id, customerId);
  }
}
