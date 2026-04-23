export type UserRole = 'Admin' | 'Courier';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthUser {
  token: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  expiresAt: string; // ISO datetime string
}
