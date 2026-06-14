import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ApiClientModule } from '../api-client/api-client.module';

@Module({
  imports: [ApiClientModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
