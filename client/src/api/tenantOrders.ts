// ── Tenant co-admin order portal ──────────────────────────────────────────────
// Mirrors the subset of AdminGroupOrderResponse the co-admin view needs.

export interface TenantOrderRow {
  id: string;
  trackingNumber: string;
  recipientName: string;
  recipientCity: string;
  recipientCityGeo?: string;
  status: string;
  orderType: string;
}

export interface TenantGroupOrder {
  id: string;
  createdAt: string;
  status: string;
  senderBusinessName: string;
  pickUpCity: string;
  pickUpCityGeo?: string;
  pickUpDistrict: string;
  pickUpDistrictGeo?: string;
  numberOfPackages: number;
  orders: TenantOrderRow[];
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The tenant co-admin's own batches (scoped server-side to their tenant). */
export async function getTenantOrders(token: string): Promise<TenantGroupOrder[]> {
  const res = await fetch('/api/tenantorders', { headers: authHeaders(token), cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load orders (${res.status})`);
  return res.json() as Promise<TenantGroupOrder[]>;
}

/** Accept one of the tenant's own pending batches. */
export async function acceptTenantOrder(id: string, token: string): Promise<void> {
  const res = await fetch(`/api/tenantorders/${id}/accept`, {
    method: 'PUT', headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to accept (${res.status})`);
}
