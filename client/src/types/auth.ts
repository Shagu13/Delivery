export type UserRole = 'Admin' | 'Operator' | 'Courier' | 'Customer' | 'TenantAdmin';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthUser {
  token:      string;
  username:   string;
  firstName:  string;
  lastName:   string;
  role:       UserRole;
  expiresAt:  string;      // ISO datetime string
  customerId?: string;     // present when role === 'Customer'
  tenantId?: string;       // present for TenantAdmin, or a tenant-owned Customer
  isSystemAdmin?: boolean; // the dedicated 'systemadmin' account — owns the Tenants page
}
