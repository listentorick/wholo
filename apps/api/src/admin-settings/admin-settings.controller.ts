import { Body, Controller, Get, Headers, Patch } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminSettingsService } from './admin-settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('Admin / Settings')
@ApiHeader({ name: 'x-distributor-id', required: true, description: 'Distributor organisation ID' })
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly service: AdminSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get distributor settings' })
  @ApiOkResponse({ description: 'Distributor settings' })
  find(@Headers('x-distributor-id') distributorId: string) {
    return this.service.find(distributorId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update distributor settings' })
  @ApiOkResponse({ description: 'Updated settings' })
  update(
    @Headers('x-distributor-id') distributorId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.service.update(distributorId, dto);
  }
}
