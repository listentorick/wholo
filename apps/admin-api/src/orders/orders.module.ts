import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [PrismaModule],
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}
