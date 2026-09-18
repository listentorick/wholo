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
  ApiNotFoundResponse, ApiBadRequestResponse, ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Permission } from '@wholo/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { AdminCustomersService } from './admin-customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

@ApiTags('Admin / Customers')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard, PermissionsGuard)
@Controller('distributors/:distributorId')
export class AdminCustomersController {
  constructor(private readonly service: AdminCustomersService) {}

  @Get('organisations/search')
  @RequirePermissions(Permission.CUSTOMERS_READ)
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
  @RequirePermissions(Permission.CUSTOMERS_READ)
  @ApiOperation({ summary: 'List trade customers for a distributor' })
  @ApiOkResponse({ description: 'Paginated list of customers' })
  findAll(
    @Param('distributorId') distributorId: string,
    @Query() query: CustomerQueryDto,
  ) {
    return this.service.findAll(distributorId, query);
  }

  // GET on a single customer is served by apps/api/src/customers/customers.controller.ts
  // (distributors/:distributorId/customers/:customerId) — merged there since it's the same
  // TradeRelationship row a distributor-staff caller and the customer themselves both read,
  // just projected differently. See CLAUDE.md's target API shape.

  @Post('customers')
  @RequirePermissions(Permission.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Create a new trade customer and optional portal invite' })
  @ApiCreatedResponse({ description: 'Customer created' })
  create(
    @Param('distributorId') distributorId: string,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.service.create(distributorId, dto);
  }

  @Patch('customers/:customerId')
  @RequirePermissions(Permission.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Update a trade customer' })
  @ApiOkResponse({ description: 'Customer updated' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  update(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.service.update(customerId, distributorId, dto);
  }

  @Delete('customers/:customerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Soft-delete a trade customer' })
  @ApiNoContentResponse({ description: 'Customer deleted' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  remove(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.service.remove(customerId, distributorId);
  }

  @Post('customers/:customerId/invite')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Send or resend a portal invite to a customer' })
  @ApiOkResponse({ description: 'Invite sent — returns invite URL and expiry' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  @ApiBadRequestResponse({ description: 'Customer has no email address' })
  invite(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
    @Body() body: { email?: string },
  ) {
    return this.service.invite(customerId, distributorId, body.email);
  }

  @Post('customers/:customerId/accept-request')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Accept a pending connection request from a trade customer' })
  @ApiOkResponse({ description: 'Customer accepted' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  @ApiUnprocessableEntityResponse({ description: 'Customer does not have a pending request' })
  acceptRequest(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.service.acceptRequest(customerId, distributorId);
  }

  @Post('customers/:customerId/decline-request')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Decline a pending connection request from a trade customer' })
  @ApiOkResponse({ description: 'Request declined' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  @ApiUnprocessableEntityResponse({ description: 'Customer does not have a pending request' })
  declineRequest(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.service.declineRequest(customerId, distributorId);
  }

  @Post('customers/:customerId/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Suspend an active trade customer' })
  @ApiOkResponse({ description: 'Customer suspended' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  @ApiUnprocessableEntityResponse({ description: 'Customer is not active' })
  suspend(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.service.suspend(customerId, distributorId);
  }

  @Post('customers/:customerId/unsuspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Unsuspend a suspended trade customer' })
  @ApiOkResponse({ description: 'Customer unsuspended' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  @ApiUnprocessableEntityResponse({ description: 'Customer is not suspended' })
  unsuspend(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.service.unsuspend(customerId, distributorId);
  }

  @Post('customers/:customerId/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Admin-activate a customer directly from pending invite (new-customer wizard)' })
  @ApiOkResponse({ description: 'Customer activated' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  @ApiUnprocessableEntityResponse({ description: 'Customer is not pending invite' })
  activate(
    @Param('distributorId') distributorId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.service.activate(customerId, distributorId);
  }
}
