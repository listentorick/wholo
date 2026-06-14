import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { PriceListsModule } from '../price-lists/price-lists.module';

@Module({
  imports: [PriceListsModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
