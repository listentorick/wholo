import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AccountingService } from './accounting.service';

interface XeroCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

// Public, unauthenticated by design: this is the actual landing point for
// Xero's browser redirect. Xero's request carries only code/state — never a
// Wholo JWT — so it cannot sit behind JwtAuthGuard. apps/api's own callback
// endpoint stays internal-only (cluster DNS); this controller is the one
// public hop, forwarding to it server-to-server and owning the browser
// redirect back into the admin app itself (same origin — see main.ts).
@Controller('accounting/xero')
export class XeroCallbackController {
  constructor(private readonly service: AccountingService) {}

  @Get('callback')
  async callback(
    @Query() query: XeroCallbackQuery,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Traefik terminates TLS and forwards plain HTTP to this pod, so
    // req.protocol alone would report 'http' even when reached over the
    // HTTPS ingress — prefer the forwarded-proto header when present.
    // Cosmetic only: the redirect_uri actually sent to Xero comes from
    // apps/api's own XERO_REDIRECT_URI config, not this reconstructed string.
    const protocol = req.get('x-forwarded-proto') ?? req.protocol;
    const callbackUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;

    const result = await this.service.handleXeroCallback(callbackUrl, query.code, query.state);

    if (result.status === 'connected') {
      res.redirect('/integrations?status=connected');
    } else {
      res.redirect(`/integrations?status=error&reason=${encodeURIComponent(result.reason)}`);
    }
  }
}
