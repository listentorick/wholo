import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AccountingContactService } from './accounting-contact.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { ImportContactDto } from './dto/import-contact.dto';
import { MatchContactDto } from './dto/match-contact.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Accounting')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('distributors/:distributorId/accounting/contacts')
export class AccountingContactController {
  constructor(private readonly service: AccountingContactService) {}

  @Get()
  @ApiOperation({ summary: 'List cached accounting contacts, with computed match/link status' })
  listContacts(@Param('distributorId') distributorId: string, @Query() query: ContactQueryDto) {
    return this.service.listContacts(distributorId, query);
  }

  @Get('needs-attention-count')
  @ApiOperation({ summary: 'Count of contacts needing review (suggested match or ready to import)' })
  async countNeedsAttention(@Param('distributorId') distributorId: string) {
    return { count: await this.service.countNeedsAttention(distributorId) };
  }

  @Post('sync')
  @ApiOperation({ summary: 'Request a contact sync — enqueues the same job the scheduled sync uses' })
  requestManualSync(@Param('distributorId') distributorId: string) {
    return this.service.requestManualSync(distributorId);
  }

  @Post(':externalContactId/import')
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
  @ApiOperation({ summary: 'Confirm a system-suggested contact-to-customer match' })
  confirmSuggestion(
    @Param('distributorId') distributorId: string,
    @Param('suggestionId') suggestionId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.confirmSuggestion(distributorId, req.user.sub, suggestionId);
  }

  @Post(':externalContactId/match')
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
  @ApiOperation({ summary: 'Ignore an accounting contact — excludes it from future match suggestions' })
  ignore(
    @Param('distributorId') distributorId: string,
    @Param('externalContactId') externalContactId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.ignore(distributorId, req.user.sub, externalContactId);
  }

  @Post('mappings/:mappingId/unlink')
  @ApiOperation({ summary: 'Unlink a confirmed customer-to-contact mapping' })
  unlink(@Param('distributorId') distributorId: string, @Param('mappingId') mappingId: string) {
    return this.service.unlink(distributorId, mappingId);
  }
}
