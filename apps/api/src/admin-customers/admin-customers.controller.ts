import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiParam, ApiTags, ApiOperation, ApiBearerAuth,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiBadRequestResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { AdminCustomersService } from './admin-customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

@ApiTags('Admin / Customers')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('admin/distributors/:distributorId')
export class AdminCustomersController {
  constructor(private readonly service: AdminCustomersService) {}

  @Get('organisations/search')
  @ApiOperation({ summary: 'Search trade customer organisations by name' })
  @ApiOkResponse({ description: 'Matching organisations' })
  searchOrganisations(
    @Param('distributorId') distributorId: string,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.searchOrganisations(distributorId, q ?? '', limit ? parseInt(limit, 10) : 10);
  }

  @Get('customers')
  @ApiOperation({ summary: 'List trade customers for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of customers' })
  findAll(
    @Param('distributorId') distributorId: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.service.findAll(distributorId, query);
  }

  @Get('customers/:id')
  @ApiOperation({ summary: 'Get a single trade customer' })
  @ApiOkResponse({ description: 'Customer detail' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  findOne(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(id, distributorId);
  }

  @Post('customers')
  @ApiOperation({ summary: 'Create a new trade customer and optional portal invite' })
  @ApiCreatedResponse({ description: 'Customer created' })
  create(
    @Param('distributorId') distributorId: string,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.service.create(distributorId, dto);
  }

  @Patch('customers/:id')
  @ApiOperation({ summary: 'Update a trade customer' })
  @ApiOkResponse({ description: 'Customer updated' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  update(
    @Param('distributorId') distributorId: string,
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
    @Param('distributorId') distributorId: string,
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
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() body: { email?: string },
  ) {
    return this.service.invite(id, distributorId, body.email);
  }
}
