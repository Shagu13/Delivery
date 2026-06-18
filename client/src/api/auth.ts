import type { AuthUser, LoginRequest } from '../types/auth';

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
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

/**
 * Sends a password-reset SMS for the account matching the given email + phone.
 * Always resolves — never rejects for unknown accounts.
 */
export async function forgotPassword(email: string, phoneNumber: string): Promise<void> {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, phoneNumber }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new AuthError(
      response.status,
      body?.title ?? 'Something went wrong. Please try again.',
    );
  }
}

export interface ResetPasswordPayload {
  code:               string;   // Short code from SMS link (?code=A3K9PQ2X1B)
  newPassword:        string;
  confirmNewPassword: string;
}

/**
 * Submits the short reset code and new password.
 * The server resolves the full Identity token internally.
 */
export async function resetPassword(data: ResetPasswordPayload): Promise<void> {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body?.errors
        ? Object.values(body.errors as Record<string, string[]>).flat()[0]
        : body?.title ?? 'Failed to reset password. The link may have expired.';
    throw new AuthError(response.status, message);
  }
}
