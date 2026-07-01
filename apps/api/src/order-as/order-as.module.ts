import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OrderAsController, OrderAsAdminController } from './order-as.controller';
import { OrderAsService } from './order-as.service';
import { OrderAsInterceptor } from './order-as.interceptor';

@Module({
  controllers: [OrderAsController, OrderAsAdminController],
  providers: [
    OrderAsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: OrderAsInterceptor,
    },
  ],
  exports: [OrderAsService],
})
export class OrderAsModule {}
