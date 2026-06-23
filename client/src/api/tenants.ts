// ── White-label tenants ───────────────────────────────────────────────────────
// Mirrors Application.Tenants.Queries.TenantDto.

export interface Tenant {
  id: string;
  host: string;
  displayName: string;
  isActive: boolean;
}

/** Admin: list all white-label tenants (for the customer→tenant assignment dropdown). */
export async function getTenants(token: string): Promise<Tenant[]> {
  const res = await fetch('/api/tenants', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load tenants (${res.status})`);
  return res.json() as Promise<Tenant[]>;
}
