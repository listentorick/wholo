import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AccountingTaxTypeService } from './accounting-tax-type.service';
import { TaxTypeQueryDto } from './dto/tax-type-query.dto';
import { ImportTaxTypeDto } from './dto/import-tax-type.dto';
import { MatchTaxTypeDto } from './dto/match-tax-type.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Accounting')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/accounting/tax-types')
export class AccountingTaxTypeController {
  constructor(private readonly service: AccountingTaxTypeService) {}

  @Get()
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: 'List cached accounting tax types, with computed match/link status' })
  listTaxTypes(@Param('distributorId') distributorId: string, @Query() query: TaxTypeQueryDto) {
    return this.service.listTaxTypes(distributorId, query);
  }

  @Get('needs-attention-count')
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Count of tax types needing review (suggested match or ready to import)' })
  async countNeedsAttention(@Param('distributorId') distributorId: string) {
    return { count: await this.service.countNeedsAttention(distributorId) };
  }

  @Post(':externalTaxTypeId/import')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Import an accounting tax rate as a new Wholo tax type' })
  importAsNewTaxType(
    @Param('distributorId') distributorId: string,
    @Param('externalTaxTypeId') externalTaxTypeId: string,
    @Body() dto: ImportTaxTypeDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.importAsNewTaxType(distributorId, req.user.sub, externalTaxTypeId, dto);
  }

  @Post('suggestions/:suggestionId/confirm')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Confirm a system-suggested tax type match' })
  confirmSuggestion(
    @Param('distributorId') distributorId: string,
    @Param('suggestionId') suggestionId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.confirmSuggestion(distributorId, req.user.sub, suggestionId);
  }

  @Post(':externalTaxTypeId/match')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Link an accounting tax rate to an existing Wholo tax type' })
  matchToExistingTaxType(
    @Param('distributorId') distributorId: string,
    @Param('externalTaxTypeId') externalTaxTypeId: string,
    @Body() dto: MatchTaxTypeDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.matchToExistingTaxType(distributorId, req.user.sub, externalTaxTypeId, dto.taxTypeId);
  }

  @Post(':externalTaxTypeId/ignore')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Ignore an accounting tax rate — excludes it from future match suggestions' })
  ignore(
    @Param('distributorId') distributorId: string,
    @Param('externalTaxTypeId') externalTaxTypeId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.ignore(distributorId, req.user.sub, externalTaxTypeId);
  }

  @Post('mappings/:mappingId/unlink')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Unlink a confirmed tax-type-to-accounting-tax-type mapping' })
  unlink(@Param('distributorId') distributorId: string, @Param('mappingId') mappingId: string) {
    return this.service.unlink(distributorId, mappingId);
  }

  @Post(':externalTaxTypeId/acknowledge-change')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Acknowledge a detected change on a linked tax rate, clearing its highlight' })
  acknowledgeChange(
    @Param('distributorId') distributorId: string,
    @Param('externalTaxTypeId') externalTaxTypeId: string,
  ) {
    return this.service.acknowledgeChange(distributorId, externalTaxTypeId);
  }
}
