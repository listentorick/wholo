import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AdminCustomersService } from './admin-customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

@Controller('admin')
export class AdminCustomersController {
  constructor(private readonly service: AdminCustomersService) {}

  @Get('customers')
  findAll(
    @Headers('x-distributor-id') distributorId: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.service.findAll(distributorId, query);
  }

  @Get('customers/:id')
  findOne(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(id, distributorId);
  }

  @Post('customers')
  create(
    @Headers('x-distributor-id') distributorId: string,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.service.create(distributorId, dto);
  }

  @Patch('customers/:id')
  update(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete('customers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(id, distributorId);
  }

  @Post('customers/:id/invite')
  @HttpCode(HttpStatus.OK)
  invite(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.invite(id, distributorId);
  }
}
