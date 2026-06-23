// ── Admin: tenant ↔ company (dilo) monthly settlement ─────────────────────────
// Mirrors Application.TenantSettlements.DTOs.TenantSettlementDto.

export interface TenantSettlement {
  id: string;
  tenantId: string;
  tenantDisplayName: string;
  year: number;
  month: number;
  totalNumberOfOrdersPlaced: number;
  totalNumberOfOrderDelivered: number;
  // dilo owes tenant (COD)
  totalCODCompanyCollectedForTenant: number;
  totalAmountOfCollectedCodPaidToTenant: number;
  amountOfCollectedCodPaidToTenant: number;
  outstandingCodOwedToTenant: number;
  // tenant owes dilo (service)
  totalCompanyServicePriceOwedByTenant: number;
  totalAmountPaidToCompanyForCompanyService: number;
  amountPaidToCompanyForCompanyService: number;
  outstandingServiceOwedByTenant: number;
  updatedAt: string | null;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (token: string) => ({ 'Content-Type': 'application/json', ...auth(token) });

/** Ensure + recompute the (tenant, year, month) settlement and return it. */
export async function getTenantSettlement(
  token: string, tenantId: string, year: number, month: number,
): Promise<TenantSettlement> {
  const p = new URLSearchParams({ tenantId, year: String(year), month: String(month) });
  const res = await fetch(`/api/tenantsettlements?${p}`, { headers: auth(token), cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load settlement (${res.status})`);
  return res.json() as Promise<TenantSettlement>;
}

export interface TenantSettlementPaymentRequest {
  tenantId: string;
  year: number;
  month: number;
  codPaidToTenant?: number;
  servicePaidByTenant?: number;
}

/** Record a livo↔dilo payment (COD paid to tenant, or service collected from tenant). */
export async function recordTenantSettlementPayment(
  token: string, data: TenantSettlementPaymentRequest,
): Promise<TenantSettlement> {
  const res = await fetch('/api/tenantsettlements/payment', {
    method: 'POST', headers: json(token), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to record payment (${res.status})`);
  return res.json() as Promise<TenantSettlement>;
}
