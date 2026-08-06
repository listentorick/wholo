import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountingService } from './accounting.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { UpdateConnectionSettingsDto } from './dto/update-connection-settings.dto';
import { ImportContactDto } from './dto/import-contact.dto';
import { MatchContactDto } from './dto/match-contact.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ImportProductDto } from './dto/import-product.dto';
import { MatchProductDto } from './dto/match-product.dto';
import { ConfirmProductSuggestionDto } from './dto/confirm-product-suggestion.dto';
import { BulkImportContactSelectionDto } from './dto/bulk-import-contact-selection.dto';
import { BulkImportProductSelectionDto } from './dto/bulk-import-product-selection.dto';
import { TaxTypeQueryDto } from './dto/tax-type-query.dto';
import { ImportTaxTypeDto } from './dto/import-tax-type.dto';
import { MatchTaxTypeDto } from './dto/match-tax-type.dto';

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

  @Patch('connection')
  updateConnectionSettings(@Body() dto: UpdateConnectionSettingsDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.updateConnectionSettings(organisationId, dto, token);
  }

  @Post('invoice-exports/:exportId/retry')
  retryInvoiceExport(@Param('exportId') exportId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.retryInvoiceExport(organisationId, exportId, token);
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

  @Post('contacts/bulk-import')
  bulkImportContacts(@Body() dto: BulkImportContactSelectionDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.bulkImportContacts(organisationId, dto, token);
  }

  @Get('contacts/bulk-import-jobs/:jobId')
  getContactBulkImportJob(@Param('jobId') jobId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.getContactBulkImportJob(organisationId, jobId, token);
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
  confirmProductSuggestion(
    @Param('suggestionId') suggestionId: string,
    @Body() dto: ConfirmProductSuggestionDto,
    @Req() req: Request,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.confirmProductSuggestion(organisationId, suggestionId, dto, token);
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

  @Post('products/:externalProductId/acknowledge-change')
  acknowledgeProductChange(@Param('externalProductId') externalProductId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.acknowledgeProductChange(organisationId, externalProductId, token);
  }

  @Post('contacts/:externalContactId/acknowledge-change')
  acknowledgeContactChange(@Param('externalContactId') externalContactId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.acknowledgeContactChange(organisationId, externalContactId, token);
  }

  @Get('tax-types')
  listTaxTypes(@Query() query: TaxTypeQueryDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.listTaxTypes(organisationId, query, token);
  }

  @Get('tax-types/needs-attention-count')
  countTaxTypesNeedingAttention(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.countTaxTypesNeedingAttention(organisationId, token);
  }

  @Post('tax-types/sync')
  syncTaxTypes(@Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.syncTaxTypes(organisationId, token);
  }

  @Post('tax-types/:externalTaxTypeId/import')
  importTaxType(
    @Param('externalTaxTypeId') externalTaxTypeId: string,
    @Body() dto: ImportTaxTypeDto,
    @Req() req: Request,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.importTaxType(organisationId, externalTaxTypeId, dto, token);
  }

  @Post('tax-types/suggestions/:suggestionId/confirm')
  confirmTaxTypeSuggestion(@Param('suggestionId') suggestionId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.confirmTaxTypeSuggestion(organisationId, suggestionId, token);
  }

  @Post('tax-types/:externalTaxTypeId/match')
  matchTaxType(
    @Param('externalTaxTypeId') externalTaxTypeId: string,
    @Body() dto: MatchTaxTypeDto,
    @Req() req: Request,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.matchTaxType(organisationId, externalTaxTypeId, dto, token);
  }

  @Post('tax-types/:externalTaxTypeId/ignore')
  ignoreTaxType(@Param('externalTaxTypeId') externalTaxTypeId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.ignoreTaxType(organisationId, externalTaxTypeId, token);
  }

  @Post('tax-types/mappings/:mappingId/unlink')
  unlinkTaxTypeMapping(@Param('mappingId') mappingId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.unlinkTaxTypeMapping(organisationId, mappingId, token);
  }

  @Post('tax-types/:externalTaxTypeId/acknowledge-change')
  acknowledgeTaxTypeChange(@Param('externalTaxTypeId') externalTaxTypeId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.acknowledgeTaxTypeChange(organisationId, externalTaxTypeId, token);
  }

  @Post('products/bulk-import')
  bulkImportProducts(@Body() dto: BulkImportProductSelectionDto, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.bulkImportProducts(organisationId, dto, token);
  }

  @Get('products/bulk-import-jobs/:jobId')
  getProductBulkImportJob(@Param('jobId') jobId: string, @Req() req: Request) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.getProductBulkImportJob(organisationId, jobId, token);
  }
}
