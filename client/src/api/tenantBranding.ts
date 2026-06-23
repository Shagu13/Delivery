// ── Tenant co-admin self-service branding/homepage ─────────────────────────────
// Mirrors Application.Tenants.Queries.MyTenantBrandingDto.

export interface MyBranding {
  id: string;
  host: string;
  displayName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  homepageJson: string | null;
}

export interface UpdateMyBrandingRequest {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  homepageJson: string | null;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Co-admin: load their own tenant's branding + homepage for editing. */
export async function getMyBranding(token: string): Promise<MyBranding> {
  const res = await fetch('/api/tenantbranding/mine', { headers: auth(token), cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load branding (${res.status})`);
  return res.json() as Promise<MyBranding>;
}

/** Co-admin: save their own header name, logo, color, and homepage content. */
export async function updateMyBranding(token: string, data: UpdateMyBrandingRequest): Promise<void> {
  const res = await fetch('/api/tenantbranding/mine', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save (${res.status})`);
}
