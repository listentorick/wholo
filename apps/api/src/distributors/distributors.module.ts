import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DistributorsController } from './distributors.controller';
import { DistributorsService } from './distributors.service';

@Module({
  imports: [PrismaModule],
  controllers: [DistributorsController],
  providers: [DistributorsService],
})
export class DistributorsModule {}
