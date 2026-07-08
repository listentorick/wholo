export type AccountingOAuthErrorReason =
  | 'access_denied'
  | 'invalid_state'
  | 'expired_state'
  | 'no_organisation'
  | 'exchange_failed';

export class AccountingOAuthError extends Error {
  constructor(public readonly reason: AccountingOAuthErrorReason, message?: string) {
    super(message ?? reason);
  }
}
