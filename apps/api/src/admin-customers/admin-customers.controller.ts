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
import {
  ApiHeader, ApiTags, ApiOperation,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiBadRequestResponse,
} from '@nestjs/swagger';
import { AdminCustomersService } from './admin-customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

@ApiTags('Admin / Customers')
@ApiHeader({ name: 'x-distributor-id', required: true, description: 'Distributor organisation ID' })
@Controller('admin')
export class AdminCustomersController {
  constructor(private readonly service: AdminCustomersService) {}

  @Get('customers')
  @ApiOperation({ summary: 'List trade customers for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of customers' })
  findAll(
    @Headers('x-distributor-id') distributorId: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.service.findAll(distributorId, query);
  }

  @Get('customers/:id')
  @ApiOperation({ summary: 'Get a single trade customer' })
  @ApiOkResponse({ description: 'Customer detail' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  findOne(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(id, distributorId);
  }

  @Post('customers')
  @ApiOperation({ summary: 'Create a new trade customer and optional portal invite' })
  @ApiCreatedResponse({ description: 'Customer created' })
  create(
    @Headers('x-distributor-id') distributorId: string,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.service.create(distributorId, dto);
  }

  @Patch('customers/:id')
  @ApiOperation({ summary: 'Update a trade customer' })
  @ApiOkResponse({ description: 'Customer updated' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  update(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete('customers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a trade customer' })
  @ApiNoContentResponse({ description: 'Customer deleted' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  remove(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(id, distributorId);
  }

  @Post('customers/:id/invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send or resend a portal invite to a customer' })
  @ApiOkResponse({ description: 'Invite sent — returns invite URL and expiry' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  @ApiBadRequestResponse({ description: 'Customer has no email address' })
  invite(
    @Headers('x-distributor-id') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.invite(id, distributorId);
  }
}
