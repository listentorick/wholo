import { Module } from '@nestjs/common';
import { CataloguesController } from './catalogues.controller';
import { CataloguesService } from './catalogues.service';

@Module({
  controllers: [CataloguesController],
  providers: [CataloguesService],
  exports: [CataloguesService],
})
export class CataloguesModule {}
