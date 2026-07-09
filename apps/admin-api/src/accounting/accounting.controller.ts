import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountingService } from './accounting.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { ImportContactDto } from './dto/import-contact.dto';
import { MatchContactDto } from './dto/match-contact.dto';

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get('connection')
  async getConnection(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    const connection = await this.service.getConnection(organisationId, token);
    if (connection === undefined) {
      res.status(204);
      return undefined;
    }
    return connection;
  }

  @Post('connections/xero/authorization-url')
  createXeroAuthorizationUrl(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.createXeroAuthorizationUrl(organisationId, token);
  }

  @Delete('connection')
  disconnect(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.disconnect(organisationId, token);
  }

  @Get('contacts')
  listContacts(@Query() query: ContactQueryDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.listContacts(organisationId, query, token);
  }

  @Get('contacts/needs-attention-count')
  countContactsNeedingAttention(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.countContactsNeedingAttention(organisationId, token);
  }

  @Post('contacts/sync')
  syncContacts(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.syncContacts(organisationId, token);
  }

  @Post('contacts/:externalContactId/import')
  importContact(
    @Param('externalContactId') externalContactId: string,
    @Body() dto: ImportContactDto,
    @Req() req: Request,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.importContact(organisationId, externalContactId, dto, token);
  }

  @Post('contacts/suggestions/:suggestionId/confirm')
  confirmSuggestion(@Param('suggestionId') suggestionId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.confirmSuggestion(organisationId, suggestionId, token);
  }

  @Post('contacts/:externalContactId/match')
  matchContact(
    @Param('externalContactId') externalContactId: string,
    @Body() dto: MatchContactDto,
    @Req() req: Request,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.matchContact(organisationId, externalContactId, dto, token);
  }

  @Post('contacts/:externalContactId/ignore')
  ignoreContact(@Param('externalContactId') externalContactId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.ignoreContact(organisationId, externalContactId, token);
  }

  @Post('contacts/mappings/:mappingId/unlink')
  unlinkMapping(@Param('mappingId') mappingId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.unlinkMapping(organisationId, mappingId, token);
  }
}
