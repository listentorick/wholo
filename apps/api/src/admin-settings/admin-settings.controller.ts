import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiParam, ApiOperation, ApiOkResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AdminSettingsService } from './admin-settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('Admin / Settings')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('admin/distributors/:distributorId/settings')
export class AdminSettingsController {
  constructor(private readonly service: AdminSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get distributor settings' })
  @ApiOkResponse({ description: 'Distributor settings' })
  find(@Param('distributorId') distributorId: string) {
    return this.service.find(distributorId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update distributor settings' })
  @ApiOkResponse({ description: 'Updated settings' })
  update(
    @Param('distributorId') distributorId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.service.update(distributorId, dto);
  }
}
