import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class DistributorAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const { distributorId } = request.params;
    const user = request.user as { organisationIds?: string[] } | undefined;

    // TODO: service-principal (client_credentials) bypass goes here once M2M auth exists.
    if (!user?.organisationIds?.includes(distributorId)) {
      throw new ForbiddenException('Not authorized for this distributor');
    }
    return true;
  }
}
