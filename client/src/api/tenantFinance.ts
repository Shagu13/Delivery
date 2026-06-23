// ── Tenant co-admin finance ───────────────────────────────────────────────────
// Mirrors Application.Tenants.Queries.TenantFinanceOverviewDto.
import type { OrderFinanceLine } from './orderFinance';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (token: string) => ({ 'Content-Type': 'application/json', ...auth(token) });

export interface TenantCustomer {
  id: string;
  businessName: string;
  isActive: boolean;
}

/** The tenant's own sub-customers (for the settlement picker). */
export async function getTenantCustomers(token: string): Promise<TenantCustomer[]> {
  const res = await fetch('/api/tenantfinance/customers', { headers: auth(token), cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load customers (${res.status})`);
  return res.json() as Promise<TenantCustomer[]>;
}

/** One sub-customer's order finance lines (scoped server-side to the tenant). */
export async function getTenantCustomerOrders(
  token: string, customerId: string, date?: string, monthly = false,
): Promise<OrderFinanceLine[]> {
  const p = new URLSearchParams({ customerId });
  if (date) p.set('date', date);
  if (monthly) p.set('monthly', 'true');
  const res = await fetch(`/api/tenantfinance/customer-orders?${p}`, { headers: auth(token), cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load orders (${res.status})`);
  return res.json() as Promise<OrderFinanceLine[]>;
}

export interface TenantOrderPayment {
  orderId: string;
  codPaid?: boolean;
  codPaidAmount?: number;
  servicePaid?: boolean;
  servicePaidAmount?: number;
}

/** Record/clear a COD payout or service-fee collection on a tenant's sub-customer order. */
export async function setTenantOrderPayment(token: string, data: TenantOrderPayment): Promise<void> {
  const res = await fetch('/api/tenantfinance/payment', {
    method: 'POST', headers: json(token), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to record payment (${res.status})`);
}

export interface TenantFinanceOverview {
  tenantOwesCompany: number;       // service fees livo owes dilo
  companyOwesTenant: number;       // COD dilo owes livo
  tenantOwesCustomers: number;     // COD livo owes its sub-customers
  customersOweTenant: number;      // service fees sub-customers owe livo
  grossCodCollected: number;
  grossServiceSenderPays: number;
  ordersDelivered: number;
  ordersActive: number;
}

/** The co-admin's live finance snapshot (scoped server-side to their tenant). */
export async function getTenantFinanceOverview(token: string): Promise<TenantFinanceOverview> {
  const res = await fetch('/api/tenantfinance/overview', {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to load finance (${res.status})`);
  return res.json() as Promise<TenantFinanceOverview>;
}
