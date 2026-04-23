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
