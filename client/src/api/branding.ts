// ── Public white-label branding ───────────────────────────────────────────────
// Mirrors Application.Tenants.Queries.TenantBrandingDto.

export interface Branding {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  homepageJson: string | null;
}

/** Look up branding for a host. Returns null for the root brand (dilo) or on any error. */
export async function fetchBranding(host: string): Promise<Branding | null> {
  try {
    const res = await fetch(`/api/tenantbranding?host=${encodeURIComponent(host)}`);
    if (res.status === 204 || !res.ok) return null;
    return await res.json() as Branding;
  } catch {
    return null;
  }
}
