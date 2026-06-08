import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll(distributorId: string) {
    return this.prisma.productType.findMany({
      where: { distributorId },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, name: true, code: true, displayOrder: true },
    });
  }
}
