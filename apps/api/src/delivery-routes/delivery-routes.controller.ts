import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Req, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DistributorAccessGuard } from '../auth/guards/distributor-access.guard';
import { DeliveryRoutesService } from './delivery-routes.service';
import { CreateDeliveryRouteDto } from './dto/create-delivery-route.dto';
import { UpdateDeliveryRouteDto } from './dto/update-delivery-route.dto';
import { DeliveryRouteQueryDto } from './dto/delivery-route-query.dto';
import { AssignRouteCustomerDto } from './dto/assign-route-customer.dto';
import { ReorderRouteCustomersDto } from './dto/reorder-route-customers.dto';

interface RequestWithUser extends Request {
  user: { sub: string };
}

// Resource-oriented, no `admin/` prefix — see CLAUDE.md's target API shape.
// Authorization is "member of this distributor org" (DistributorAccessGuard)
// for every action here, including customer assignment/reorder; a
// fine-grained read/manage permission split is an explicit fast-follow, not
// built in this PBI (see the delivery-routes-and-runs plan's Open Decisions).
@ApiTags('Delivery Routes')
@ApiBearerAuth()
@ApiParam({ name: 'distributorId', description: 'Distributor organisation ID' })
@UseGuards(JwtAuthGuard, DistributorAccessGuard)
@Controller('distributors/:distributorId/delivery-routes')
export class DeliveryRoutesController {
  constructor(private service: DeliveryRoutesService) {}

  @Get()
  @ApiOperation({ summary: 'List delivery routes for a distributor' })
  findAll(
    @Param('distributorId') distributorId: string,
    @Query() query: DeliveryRouteQueryDto,
  ) {
    return this.service.findAll(distributorId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a delivery route' })
  create(
    @Param('distributorId') distributorId: string,
    @Body() dto: CreateDeliveryRouteDto,
  ) {
    return this.service.create(distributorId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a delivery route with its assigned customers' })
  findOne(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(id, distributorId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a delivery route' })
  update(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryRouteDto,
  ) {
    return this.service.update(id, distributorId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete (deactivate) a delivery route' })
  remove(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(id, distributorId);
  }

  @Get(':id/customers')
  @ApiOperation({ summary: 'List a route\'s active customer assignments in drop order' })
  listCustomers(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
  ) {
    return this.service.listCustomers(id, distributorId);
  }

  @Post(':id/customers')
  @ApiOperation({ summary: 'Assign a customer to a route as its active default' })
  assignCustomer(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: AssignRouteCustomerDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.assignCustomer(id, distributorId, dto, req.user.sub);
  }

  @Delete(':id/customers/:customerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End a customer\'s active assignment to this route' })
  removeCustomer(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Param('customerId') customerId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.removeCustomer(id, customerId, distributorId, req.user.sub);
  }

  @Patch(':id/customers/reorder')
  @ApiOperation({ summary: 'Bulk-update a route\'s default drop order' })
  reorderCustomers(
    @Param('distributorId') distributorId: string,
    @Param('id') id: string,
    @Body() dto: ReorderRouteCustomersDto,
  ) {
    return this.service.reorderCustomers(id, distributorId, dto);
  }
}
