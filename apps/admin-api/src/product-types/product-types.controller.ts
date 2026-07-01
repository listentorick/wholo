import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductTypesService } from './product-types.service';

@UseGuards(JwtAuthGuard)
@Controller('product-types')
export class ProductTypesController {
  constructor(private productTypesService: ProductTypesService) {}

  @Get()
  findAll(@Req() req: Request) {
    const user = req.user as { organisationId: string; token: string };
    return this.productTypesService.findAll(user.organisationId, user.token);
  }
}
