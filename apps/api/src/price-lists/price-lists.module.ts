import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminPriceListsController } from './admin-price-lists.controller';
import { AdminPriceListsService } from './admin-price-lists.service';
import { PriceResolutionService } from './price-resolution.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminPriceListsController],
  providers: [AdminPriceListsService, PriceResolutionService],
  exports: [PriceResolutionService],
})
export class PriceListsModule {}
