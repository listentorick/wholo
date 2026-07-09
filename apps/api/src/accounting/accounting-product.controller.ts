import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AccountingProductService } from './accounting-product.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { ImportProductDto } from './dto/import-product.dto';
import { MatchProductDto } from './dto/match-product.dto';

interface RequestWithUser extends Request {
  user: { sub: string; organisationId: string };
}

@ApiTags('Accounting')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('distributors/:distributorId/accounting/products')
export class AccountingProductController {
  constructor(private readonly service: AccountingProductService) {}

  @Get()
  @ApiOperation({ summary: 'List cached accounting products, with computed match/link status' })
  listProducts(@Param('distributorId') distributorId: string, @Query() query: ProductQueryDto) {
    return this.service.listProducts(distributorId, query);
  }

  @Get('needs-attention-count')
  @ApiOperation({ summary: 'Count of products needing review (suggested match or ready to import)' })
  async countNeedsAttention(@Param('distributorId') distributorId: string) {
    return { count: await this.service.countNeedsAttention(distributorId) };
  }

  @Post('sync')
  @ApiOperation({ summary: 'Request a product sync — enqueues the same job the scheduled sync uses' })
  requestManualSync(@Param('distributorId') distributorId: string) {
    return this.service.requestManualSync(distributorId);
  }

  @Post(':externalProductId/import')
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
  @ApiOperation({ summary: 'Confirm a system-suggested product match' })
  confirmSuggestion(
    @Param('distributorId') distributorId: string,
    @Param('suggestionId') suggestionId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.confirmSuggestion(distributorId, req.user.sub, suggestionId);
  }

  @Post(':externalProductId/match')
  @ApiOperation({ summary: 'Link an accounting product to an existing Wholo product' })
  matchToExistingProduct(
    @Param('distributorId') distributorId: string,
    @Param('externalProductId') externalProductId: string,
    @Body() dto: MatchProductDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.matchToExistingProduct(distributorId, req.user.sub, externalProductId, dto.productId);
  }

  @Post(':externalProductId/ignore')
  @ApiOperation({ summary: 'Ignore an accounting product — excludes it from future match suggestions' })
  ignore(
    @Param('distributorId') distributorId: string,
    @Param('externalProductId') externalProductId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.ignore(distributorId, req.user.sub, externalProductId);
  }

  @Post('mappings/:mappingId/unlink')
  @ApiOperation({ summary: 'Unlink a confirmed product-to-accounting-product mapping' })
  unlink(@Param('distributorId') distributorId: string, @Param('mappingId') mappingId: string) {
    return this.service.unlink(distributorId, mappingId);
  }
}
