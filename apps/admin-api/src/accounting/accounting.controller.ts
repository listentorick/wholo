import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountingService } from './accounting.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { ImportContactDto } from './dto/import-contact.dto';
import { MatchContactDto } from './dto/match-contact.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ImportProductDto } from './dto/import-product.dto';
import { MatchProductDto } from './dto/match-product.dto';

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

  @Get('products')
  listProducts(@Query() query: ProductQueryDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.listProducts(organisationId, query, token);
  }

  @Get('products/needs-attention-count')
  countProductsNeedingAttention(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.countProductsNeedingAttention(organisationId, token);
  }

  @Post('products/sync')
  syncProducts(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.syncProducts(organisationId, token);
  }

  @Post('products/:externalProductId/import')
  importProduct(
    @Param('externalProductId') externalProductId: string,
    @Body() dto: ImportProductDto,
    @Req() req: Request,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.importProduct(organisationId, externalProductId, dto, token);
  }

  @Post('products/suggestions/:suggestionId/confirm')
  confirmProductSuggestion(@Param('suggestionId') suggestionId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.confirmProductSuggestion(organisationId, suggestionId, token);
  }

  @Post('products/:externalProductId/match')
  matchProduct(
    @Param('externalProductId') externalProductId: string,
    @Body() dto: MatchProductDto,
    @Req() req: Request,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.matchProduct(organisationId, externalProductId, dto, token);
  }

  @Post('products/:externalProductId/ignore')
  ignoreProduct(@Param('externalProductId') externalProductId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.ignoreProduct(organisationId, externalProductId, token);
  }

  @Post('products/mappings/:mappingId/unlink')
  unlinkProductMapping(@Param('mappingId') mappingId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.unlinkProductMapping(organisationId, mappingId, token);
  }
}
