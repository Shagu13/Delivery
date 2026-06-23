// ── White-label tenants ───────────────────────────────────────────────────────
// Mirrors Application.Tenants.Queries.TenantDto.

export interface Tenant {
  id: string;
  host: string;
  displayName: string;
  isActive: boolean;
  logoUrl: string | null;
  primaryColor: string | null;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = (token: string) => ({ 'Content-Type': 'application/json', ...authHeaders(token) });

/** Admin: list all white-label tenants (assignment dropdown + management). */
export async function getTenants(token: string): Promise<Tenant[]> {
  const res = await fetch('/api/tenants', { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Failed to load tenants (${res.status})`);
  return res.json() as Promise<Tenant[]>;
}

export interface CreateTenantRequest {
  host: string; displayName: string; logoUrl?: string | null; primaryColor?: string | null;
  coAdminFirstName: string; coAdminLastName: string; coAdminEmail: string; coAdminPassword: string;
}

export interface UpdateTenantRequest {
  host: string; displayName: string; logoUrl?: string | null; primaryColor?: string | null; isActive: boolean;
}

export class TenantApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly errors?: Record<string, string[]>) {
    super(message); this.name = 'TenantApiError';
  }
}

async function throwIfBad(res: Response): Promise<void> {
  if (res.ok) return;
  const body = await res.json().catch(() => null);
  throw new TenantApiError(res.status, body?.title ?? `Request failed (${res.status})`, body?.errors);
}

/** Admin: onboard a tenant + its co-admin login. */
export async function createTenant(token: string, data: CreateTenantRequest): Promise<void> {
  const res = await fetch('/api/tenants', { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(data) });
  await throwIfBad(res);
}

/** Admin: edit a tenant's host + branding + active flag. */
export async function updateTenant(token: string, id: string, data: UpdateTenantRequest): Promise<void> {
  const res = await fetch(`/api/tenants/${id}`, { method: 'PUT', headers: jsonHeaders(token), body: JSON.stringify(data) });
  await throwIfBad(res);
}
