import { Body, Controller, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AccountingConnectionService } from './accounting-connection.service';
import { AccountingOAuthError } from './accounting-oauth.error';
import { XeroCallbackDto } from './dto/xero-callback.dto';

// Internal, cluster-DNS-only endpoint — must never be given a public ingress
// route. Xero's browser redirect never reaches this service directly; it
// lands on apps/admin-api (the public admin origin), which calls this
// endpoint server-to-server and owns the browser-facing redirect itself.
// Unauthenticated here too: there is no user JWT to check for this
// machine-to-machine call either way. Trust is anchored in the single-use
// AccountingOAuthState row instead (see AccountingConnectionService).
@ApiExcludeController()
@Controller('accounting/xero')
export class XeroCallbackController {
  constructor(private readonly service: AccountingConnectionService) {}

  @Post('callback')
  async callback(
    @Body() body: XeroCallbackDto,
  ): Promise<{ status: 'connected' } | { status: 'error'; reason: string }> {
    try {
      await this.service.handleCallback(body.callbackUrl, body.code, body.state);
      return { status: 'connected' };
    } catch (err) {
      const reason = err instanceof AccountingOAuthError ? err.reason : 'unknown';
      return { status: 'error', reason };
    }
  }
}
