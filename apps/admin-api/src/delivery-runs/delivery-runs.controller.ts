import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeliveryRunsService } from './delivery-runs.service';

@UseGuards(JwtAuthGuard)
@Controller('delivery-runs')
export class DeliveryRunsController {
  constructor(private service: DeliveryRunsService) {}

  // Nest defaults a bare @Post() to 201 — override to 200 to match
  // apps/api's own @HttpCode(OK) on this action (a move, not a resource
  // creation) and to be consistent with the other two mutations below.
  @Post(':runId/orders')
  @HttpCode(HttpStatus.OK)
  assignOrderToRun(@Req() req: Request, @Param('runId') runId: string, @Body() body: unknown) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.assignOrderToRun(organisationId, runId, body, token);
  }

  // Deliberately no @HttpCode(NO_CONTENT) — contrast with delivery-routes'
  // two DELETEs, both 204. This one proxies apps/api's 200 response body
  // (the refreshed board) straight through; ApiClientService.parseResponse
  // only discards a body on a literal 204, so omitting the decorator here
  // is the only change needed.
  @Delete(':runId/orders/:orderId')
  unassignOrderFromRun(
    @Req() req: Request,
    @Param('runId') runId: string,
    @Param('orderId') orderId: string,
    @Query('version') version: string,
  ) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.unassignOrderFromRun(organisationId, runId, orderId, version, token);
  }

  @Patch(':runId/orders/reorder')
  reorderRunOrders(@Req() req: Request, @Param('runId') runId: string, @Body() body: unknown) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.reorderRunOrders(organisationId, runId, body, token);
  }

  @Patch(':runId')
  updateRun(@Req() req: Request, @Param('runId') runId: string, @Body() body: unknown) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    return this.service.updateRun(organisationId, runId, body, token);
  }

  // Plain @Res() (not passthrough) — this method has no JSON return-value
  // contract for Nest to serialize, so it takes full manual control of the
  // response rather than returning something for Nest to interpret.
  @Get(':runId/manifest')
  async getManifest(@Req() req: Request, @Param('runId') runId: string, @Res() res: Response) {
    const { organisationId, token } = req.user as { organisationId: string; token: string };
    const { buffer, contentType, contentDisposition } = await this.service.getManifest(organisationId, runId, token);
    res.set({
      'Content-Type': contentType,
      ...(contentDisposition && { 'Content-Disposition': contentDisposition }),
    });
    res.send(buffer);
  }
}
