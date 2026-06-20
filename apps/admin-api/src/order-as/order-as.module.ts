import { Module } from '@nestjs/common';
import { ApiClientModule } from '../api-client/api-client.module';
import { OrderAsController } from './order-as.controller';
import { OrderAsService } from './order-as.service';

@Module({
  imports: [ApiClientModule],
  controllers: [OrderAsController],
  providers: [OrderAsService],
})
export class OrderAsModule {}
