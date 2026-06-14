import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminSuppliersService {
  constructor(private prisma: PrismaService) {}

  findAll(distributorId: string) {
    return this.prisma.supplier.findMany({
      where: { distributorId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}
