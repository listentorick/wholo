import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AccountingContactService } from './accounting-contact.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { ImportContactDto } from './dto/import-contact.dto';
import { MatchContactDto } from './dto/match-contact.dto';
import { BulkImportContactSelectionDto } from './dto/bulk-import-contact-selection.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Accounting')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/accounting/contacts')
export class AccountingContactController {
  constructor(private readonly service: AccountingContactService) {}

  @Get()
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: 'List cached accounting contacts, with computed match/link status' })
  listContacts(@Param('distributorId') distributorId: string, @Query() query: ContactQueryDto) {
    return this.service.listContacts(distributorId, query);
  }

  @Get('needs-attention-count')
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Count of contacts needing review (suggested match or ready to import)' })
  async countNeedsAttention(@Param('distributorId') distributorId: string) {
    return { count: await this.service.countNeedsAttention(distributorId) };
  }

  @Post(':externalContactId/import')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Import an accounting contact as a new Wholo customer (no login user, no invitation)' })
  importAsNewCustomer(
    @Param('distributorId') distributorId: string,
    @Param('externalContactId') externalContactId: string,
    @Body() dto: ImportContactDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.importAsNewCustomer(distributorId, req.user.sub, externalContactId, dto);
  }

  @Post('suggestions/:suggestionId/confirm')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Confirm a system-suggested contact-to-customer match' })
  confirmSuggestion(
    @Param('distributorId') distributorId: string,
    @Param('suggestionId') suggestionId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.confirmSuggestion(distributorId, req.user.sub, suggestionId);
  }

  @Post(':externalContactId/match')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Link an accounting contact to an existing Wholo customer' })
  matchToExistingCustomer(
    @Param('distributorId') distributorId: string,
    @Param('externalContactId') externalContactId: string,
    @Body() dto: MatchContactDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.matchToExistingCustomer(distributorId, req.user.sub, externalContactId, dto.tradeRelationshipId);
  }

  @Post(':externalContactId/ignore')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Ignore an accounting contact — excludes it from future match suggestions' })
  ignore(
    @Param('distributorId') distributorId: string,
    @Param('externalContactId') externalContactId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.ignore(distributorId, req.user.sub, externalContactId);
  }

  @Post('mappings/:mappingId/unlink')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Unlink a confirmed customer-to-contact mapping' })
  unlink(@Param('distributorId') distributorId: string, @Param('mappingId') mappingId: string) {
    return this.service.unlink(distributorId, mappingId);
  }

  @Post(':externalContactId/acknowledge-change')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Acknowledge a detected change on a linked contact, clearing its highlight' })
  acknowledgeChange(
    @Param('distributorId') distributorId: string,
    @Param('externalContactId') externalContactId: string,
  ) {
    return this.service.acknowledgeChange(distributorId, externalContactId);
  }

  @Post('bulk-import')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Queue a bulk import of accounting contacts, by explicit ids or a server-side filter' })
  requestBulkImport(
    @Param('distributorId') distributorId: string,
    @Body() dto: BulkImportContactSelectionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.requestBulkImport(distributorId, req.user.sub, dto);
  }

  @Get('bulk-import-jobs/:jobId')
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: "Get a bulk import job's status and per-item report" })
  getBulkImportJob(@Param('distributorId') distributorId: string, @Param('jobId') jobId: string) {
    return this.service.getBulkImportJob(distributorId, jobId);
  }
}
