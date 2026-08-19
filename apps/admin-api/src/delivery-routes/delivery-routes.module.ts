import { Module } from '@nestjs/common';
import { ApiClientModule } from '../api-client/api-client.module';
import { DeliveryRoutesService } from './delivery-routes.service';
import { DeliveryRoutesController } from './delivery-routes.controller';

@Module({
  imports: [ApiClientModule],
  controllers: [DeliveryRoutesController],
  providers: [DeliveryRoutesService],
  exports: [DeliveryRoutesService],
})
export class DeliveryRoutesModule {}
