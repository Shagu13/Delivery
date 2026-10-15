import { AuthError } from '../../api/auth';
import type { translations } from '../../contexts/translations';

type T = (typeof translations)['en'];

/**
 * Turns a failed reset-flow call into a translated, user-friendly message. The server tags each
 * known failure with a stable code; unknown failures fall back to the server text or `fallback`.
 */
export function resetErrorMessage(err: unknown, t: T, fallback: string): string {
  if (!(err instanceof AuthError)) return fallback;
  const firstNumber = Number(/\d+/.exec(err.message)?.[0] ?? 0);

  switch (err.code) {
    case 'AccountNotFound': return t.resetErrAccountNotFound;
    case 'ResendTooSoon':   return t.resetErrResendTooSoon(firstNumber);
    case 'TooManyRequests': return t.resetErrTooManyRequests;
    case 'SmsFailed':       return t.resetErrSmsFailed;
    case 'SmsInvalidPhone': return t.resetErrSmsInvalidPhone;
    case 'CodeWrong':       return t.resetErrCodeWrong(firstNumber);
    case 'CodeExpired':     return t.resetErrCodeExpired;
    case 'TooManyAttempts': return t.resetErrTooManyAttempts;
    case 'TicketInvalid':   return t.resetErrTicketInvalid;
    default:                return err.message || fallback;
  }
}
