import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AccountingProductService } from './accounting-product.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { ImportProductDto } from './dto/import-product.dto';
import { MatchProductDto } from './dto/match-product.dto';
import { ConfirmProductSuggestionDto } from './dto/confirm-product-suggestion.dto';
import { BulkImportProductSelectionDto } from './dto/bulk-import-product-selection.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Accounting')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId/accounting/products')
export class AccountingProductController {
  constructor(private readonly service: AccountingProductService) {}

  @Get()
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: 'List cached accounting products, with computed match/link status' })
  listProducts(@Param('distributorId') distributorId: string, @Query() query: ProductQueryDto) {
    return this.service.listProducts(distributorId, query);
  }

  @Get('needs-attention-count')
  @RequirePermissions(Permission.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Count of products needing review (suggested match or ready to import)' })
  async countNeedsAttention(@Param('distributorId') distributorId: string) {
    return { count: await this.service.countNeedsAttention(distributorId) };
  }

  @Post(':externalProductId/import')
  @RequirePermissions(Permission.ACCOUNTING_IMPORT)
  @ApiOperation({ summary: 'Import an accounting product as a new Wholo product (DRAFT — needs catalogue setup)' })
  importAsNewProduct(
    @Param('distributorId') distributorId: string,
    @Param('externalProductId') externalProductId: string,
    @Body() dto: ImportProductDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.importAsNewProduct(distributorId, req.user.sub, externalProductId, dto);
  }

  @Post('suggestions/:suggestionId/confirm')
  @RequirePermissions(Permission.ACCOUNTING_IMPORT)
  @ApiOperation({ summary: 'Confirm a system-suggested product match' })
  confirmSuggestion(
    @Param('distributorId') distributorId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() dto: ConfirmProductSuggestionDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.confirmSuggestion(distributorId, req.user.sub, suggestionId, dto.confirmTaxTypeOverride);
  }

  @Post(':externalProductId/match')
  @RequirePermissions(Permission.ACCOUNTING_IMPORT)
  @ApiOperation({ summary: 'Link an accounting product to an existing Wholo product' })
  matchToExistingProduct(
    @Param('distributorId') distributorId: string,
    @Param('externalProductId') externalProductId: string,
    @Body() dto: MatchProductDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.matchToExistingProduct(
      distributorId,
      req.user.sub,
      externalProductId,
      dto.productId,
      dto.confirmTaxTypeOverride,
    );
  }

  @Post(':externalProductId/ignore')
  @RequirePermissions(Permission.ACCOUNTING_IMPORT)
  @ApiOperation({ summary: 'Ignore an accounting product — excludes it from future match suggestions' })
  ignore(
    @Param('distributorId') distributorId: string,
    @Param('externalProductId') externalProductId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.ignore(distributorId, req.user.sub, externalProductId);
  }

  @Post('mappings/:mappingId/unlink')
  @RequirePermissions(Permission.ACCOUNTING_IMPORT)
  @ApiOperation({ summary: 'Unlink a confirmed product-to-accounting-product mapping' })
  unlink(@Param('distributorId') distributorId: string, @Param('mappingId') mappingId: string) {
    return this.service.unlink(distributorId, mappingId);
  }

  @Post(':externalProductId/acknowledge-change')
  @RequirePermissions(Permission.ACCOUNTING_IMPORT)
  @ApiOperation({ summary: 'Acknowledge a detected change on a linked product, clearing its highlight' })
  acknowledgeChange(
    @Param('distributorId') distributorId: string,
    @Param('externalProductId') externalProductId: string,
  ) {
    return this.service.acknowledgeChange(distributorId, externalProductId);
  }

  @Post('bulk-import')
  @RequirePermissions(Permission.ACCOUNTING_IMPORT)
  @ApiOperation({ summary: 'Queue a bulk import of accounting products, by explicit ids or a server-side filter' })
  requestBulkImport(
    @Param('distributorId') distributorId: string,
    @Body() dto: BulkImportProductSelectionDto,
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
