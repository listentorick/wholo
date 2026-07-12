import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AccountingProvider } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AccountingConnectionService } from './accounting-connection.service';
import { UpdateConnectionSettingsDto } from './dto/update-connection-settings.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Accounting')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('distributors/:distributorId/accounting')
export class AccountingConnectionController {
  constructor(private readonly service: AccountingConnectionService) {}

  @Get('connection')
  @ApiOperation({ summary: 'Get the distributor\'s current accounting connection status' })
  @ApiNoContentResponse({ description: 'No accounting connection exists for this distributor' })
  async getConnection(
    @Param('distributorId') distributorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const status = await this.service.getConnectionStatus(distributorId);
    if (!status) {
      res.status(204);
      return undefined;
    }
    return status;
  }

  @Post('connections/xero/authorization-url')
  @ApiOperation({ summary: 'Start a Xero OAuth connection — returns the consent URL to navigate to' })
  createXeroAuthorizationUrl(
    @Param('distributorId') distributorId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.createAuthorizationUrl(distributorId, req.user.sub, AccountingProvider.XERO);
  }

  @Patch('connection')
  @ApiOperation({ summary: 'Update settings on the distributor\'s current accounting connection' })
  updateConnectionSettings(
    @Param('distributorId') distributorId: string,
    @Body() dto: UpdateConnectionSettingsDto,
  ) {
    return this.service.updateConnectionSettings(distributorId, dto);
  }

  @Delete('connection')
  @ApiOperation({ summary: 'Disconnect the distributor\'s active accounting connection' })
  disconnect(@Param('distributorId') distributorId: string) {
    return this.service.disconnect(distributorId);
  }
}
