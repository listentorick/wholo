import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryRoutesService } from './delivery-routes.service';
import { DeliveryRoutesController } from './delivery-routes.controller';

@Module({
  imports: [PrismaModule],
  controllers: [DeliveryRoutesController],
  providers: [DeliveryRoutesService],
  exports: [DeliveryRoutesService],
})
export class DeliveryRoutesModule {}
