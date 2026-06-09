import { Module } from '@nestjs/common';
import { AdminCataloguesController } from './admin-catalogues.controller';
import { AdminCataloguesService } from './admin-catalogues.service';

@Module({
  controllers: [AdminCataloguesController],
  providers: [AdminCataloguesService],
})
export class AdminCataloguesModule {}
