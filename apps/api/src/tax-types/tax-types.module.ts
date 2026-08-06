import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TaxTypesController } from './tax-types.controller';
import { TaxTypesService } from './tax-types.service';

@Module({
  imports: [PrismaModule],
  controllers: [TaxTypesController],
  providers: [TaxTypesService],
  // AccountingTaxTypeService (AccountingModule) reuses create() when
  // importing a new Stocdup TaxType from a Xero tax rate — same reasoning as
  // AdminProductsModule being exported for AccountingProductService.
  exports: [TaxTypesService],
})
export class TaxTypesModule {}
