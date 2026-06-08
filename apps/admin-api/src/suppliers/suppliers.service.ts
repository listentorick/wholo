import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async findAll(distributorId: string) {
    return this.prisma.supplier.findMany({
      where: { distributorId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}
