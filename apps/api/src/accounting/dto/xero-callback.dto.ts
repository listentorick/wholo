import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class XeroCallbackDto {
  // The full URL the browser hit on admin-api (or at least its query
  // string) — only the query-string portion is functionally required, since
  // it's parsed by xero-node's callbackParams() inside the adapter.
  @IsString()
  @IsNotEmpty()
  callbackUrl!: string;

  // Optional: Xero omits `code` and sends `error` instead when the
  // distributor admin declines consent (error=access_denied).
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;
}
