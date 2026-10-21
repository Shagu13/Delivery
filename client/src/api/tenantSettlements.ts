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

// ── Per-order settlement sheet ──────────────────────────────────────────────────

export interface TenantSettlementOrder {
  orderId: string;
  trackingNumber: string;
  businessName: string;
  customerName: string;
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  cod: number;
  codPaidToTenant: number;
  companyServicePrice: number;
  whoPaysForCompanyService: string;   // "Sender" | "Recipient"
  servicePaidByTenant: number;
  createdAt: string;
  deliveredAt: string | null;
  /** The part of the fee the sender (so the tenant) owes on top of what the recipient pays. */
  customerSurcharge: number;
  /** What the tenant owes dilo for this order's fee: the whole fee on sender-pays orders, only the surcharge on recipient-pays ones. */
  serviceOwed: number;
}

export interface TenantSettlementOrders {
  orders: TenantSettlementOrder[];
  totalCod: number;
  totalCodPaid: number;
  totalService: number;
  totalServicePaid: number;
}

/** The selected tenant's delivered orders for a day (or month), with per-order settlement state. */
export async function getTenantSettlementOrders(
  token: string, tenantId: string, date?: string, monthly = false,
): Promise<TenantSettlementOrders> {
  const p = new URLSearchParams({ tenantId });
  if (date) p.set('date', date);
  if (monthly) p.set('monthly', 'true');
  const res = await fetch(`/api/tenantsettlements/orders?${p}`, { headers: auth(token), cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load orders (${res.status})`);
  return res.json() as Promise<TenantSettlementOrders>;
}

export interface TenantOrderPaymentRequest {
  tenantId: string;
  orderId: string;
  codPaid?: boolean;
  codPaidAmount?: number;
  servicePaid?: boolean;
  servicePaidAmount?: number;
}

/** Record/clear a per-order dilo↔tenant payment (COD to tenant, or service from tenant). */
export async function recordTenantOrderPayment(token: string, data: TenantOrderPaymentRequest): Promise<void> {
  const res = await fetch('/api/tenantsettlements/order-payment', {
    method: 'POST', headers: json(token), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to record payment (${res.status})`);
}
