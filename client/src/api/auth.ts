import type { AuthUser, LoginRequest } from '../types/auth';

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Stable server error code (e.g. 'CodeWrong') from a 422 response, when there is one. */
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function login(data: LoginRequest): Promise<AuthUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new AuthError(
      response.status,
      body?.title ?? 'Invalid username or password.',
    );
  }

  return response.json() as Promise<AuthUser>;
}

/** Builds an AuthError from a failed response, keeping the server's error code for translation. */
async function toAuthError(response: Response, fallback: string): Promise<AuthError> {
  const body = await response.json().catch(() => null);
  const errors = body?.errors as Record<string, string[]> | undefined;
  const code = errors ? Object.keys(errors)[0] : undefined;
  const message = errors ? Object.values(errors).flat()[0] : body?.title ?? fallback;
  return new AuthError(response.status, message, code);
}

export interface ForgotPasswordResult {
  expiresInSeconds: number;
  resendInSeconds:  number;
}

/**
 * Step 1 — texts a 6-digit code to the phone on the account matching email + phone.
 * Rejects with a user-friendly AuthError when nothing matches or the SMS could not be sent.
 */
export async function forgotPassword(email: string, phoneNumber: string): Promise<ForgotPasswordResult> {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, phoneNumber }),
  });

  if (!response.ok) throw await toAuthError(response, 'Something went wrong. Please try again.');
  return response.json() as Promise<ForgotPasswordResult>;
}

/** Step 2 — checks the SMS code; returns the single-use ticket that authorises step 3. */
export async function verifyResetCode(email: string, code: string): Promise<string> {
  const response = await fetch('/api/auth/verify-reset-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });

  if (!response.ok) throw await toAuthError(response, 'Failed to verify the code.');
  const body = await response.json() as { ticket: string };
  return body.ticket;
}

export interface ResetPasswordPayload {
  ticket:             string;   // from verifyResetCode
  newPassword:        string;
  confirmNewPassword: string;
}

/** Step 3 — sets the new password using the ticket from step 2. */
export async function resetPassword(data: ResetPasswordPayload): Promise<void> {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) throw await toAuthError(response, 'Failed to reset password. Please start again.');
}
