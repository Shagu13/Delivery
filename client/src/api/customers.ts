import type { PagedResult } from '../types/paging';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegisterCustomerRequest {
  firstName: string; lastName: string; idNumber?: string;
  businessName: string; phoneNumber: string;
  city: string; district: string; address: string;
  email: string; password: string; confirmPassword: string;
}

export interface CreateCustomerRequest {
  firstName: string; lastName: string; idNumber?: string;
  businessName: string; phoneNumber: string;
  city: string; district: string; address: string;
  email: string; password: string;
  isCompanyServicePriceIncludedInPrice?: boolean;
  /** White-label tenant to assign the new customer to. Omit/null = root brand (dilo). */
  tenantId?: string | null;
}

export interface UpdateCustomerRequest {
  firstName: string; lastName: string; idNumber?: string;
  businessName: string; phoneNumber: string;
  city: string; district: string; address: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface CreateCustomerResponse {
  customerId: string; email: string; fullName: string;
}

export interface Customer {
  id: string;
  firstName: string; lastName: string; idNumber: string | null;
  businessName: string; phoneNumber: string;
  city: string; district: string; address: string;
  email: string; isActive: boolean; createdAt: string;
  companyServiceCapitalPrice:  number | null;
  companyServiceCityPrice:     number | null;
  companyServiceDistrictPrice: number | null;
  /** When true, this customer's package prices are all-in (service fee deducted in background). */
  isCompanyServicePriceIncludedInPrice: boolean;
}

export interface AdminCustomer extends Customer {
  companyServiceCapitalPrice:  number | null;
  companyServiceCityPrice:     number | null;
  companyServiceDistrictPrice: number | null;
  /** White-label tenant this customer belongs to. Null = root brand (dilo). */
  tenantId: string | null;
  /** Display name of the owning tenant (null when root). */
  tenantDisplayName: string | null;
}

export type { PagedResult } from '../types/paging';

// ── Order types ───────────────────────────────────────────────────────────────

export interface CustomerOrder {
  id: string; trackingNumber: string;
  recipientName: string;
  recipientPhone: string; recipientCity: string; recipientCityGeo?: string;
  recipientDistrict: string; recipientDistrictGeo?: string; recipientAddress: string;
  description: string | null; status: string;
  orderType: 'Send' | 'Return' | 'Exchange';
  productPaymentStatus: 'NotPaid' | 'Paid'; createdAt: string;
  /** Who pays the company service fee — decides whether it's added to the recipient's amount due. */
  whoPaysForCompanyService?: 'Sender' | 'Recipient';
  companyServicePrice?: number;
  /** True when amountToCollectForPackage is the all-in price (product + service fee bundled). */
  isCompanyServicePriceIncluded?: boolean;
  amountToCollectForPackage?: number | null;
  /** Why a courier cancelled the delivery (null unless cancelled). */
  cancellationReason?: 'DidNotLike' | 'DidNotWant' | 'WrongSize' | 'Other' | 'WarehouseNotReceived' | null;
  /** Free-text note captured for the "Other" reason. */
  cancellationComment?: string | null;
  /** Set once an admin marked this cancelled order as physically returned to the sender. */
  cancelledReturnedToSenderAt?: string | null;
}

export interface CustomerGroupOrder {
  id: string; createdAt: string; status: string;
  senderBusinessName: string;
  senderPhone?: string;
  alternativeSenderPhone?: string | null;
  pickUpCity: string; pickUpCityGeo?: string;
  pickUpDistrict: string; pickUpDistrictGeo?: string;
  pickUpAddress?: string;
  note: string | null; numberOfPackages: number;
  orders: CustomerOrder[];
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class CustomerApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Record<string, string[]>,
  ) { super(message); this.name = 'CustomerApiError'; }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new CustomerApiError(res.status,
      body?.title ?? `Request failed with status ${res.status}`, body?.errors);
  }
  return res.json() as Promise<T>;
}

async function handleEmpty(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new CustomerApiError(res.status,
      body?.title ?? `Request failed with status ${res.status}`, body?.errors);
  }
}

// ── Auth-less ─────────────────────────────────────────────────────────────────

export async function registerCustomer(data: RegisterCustomerRequest): Promise<CreateCustomerResponse> {
  return handle(await fetch('/api/customers/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

// ── Customer self-service ─────────────────────────────────────────────────────

export async function getMyProfile(token: string): Promise<Customer> {
  return handle(await fetch('/api/customers/me', {
    headers: { Authorization: `Bearer ${token}` },
  }));
}

export async function updateMyProfile(
  data: UpdateCustomerRequest, token: string
): Promise<void> {
  return handleEmpty(await fetch('/api/customers/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  }));
}

export async function changePassword(
  data: ChangePasswordRequest, token: string
): Promise<void> {
  return handleEmpty(await fetch('/api/customers/me/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  }));
}

export async function getMyOrders(token: string): Promise<CustomerGroupOrder[]> {
  return handle(await fetch('/api/grouporders/my', {
    headers: { Authorization: `Bearer ${token}` },
  }));
}

/// Cancel a pending group order (only valid while status = Pending)
export async function cancelGroupOrder(groupOrderId: string, token: string): Promise<void> {
  return handleEmpty(await fetch(`/api/grouporders/${groupOrderId}/cancel`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  }));
}

export interface UpdateMyOrderRequest {
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  amountToCollectForPackage: number | null;
}

/// Edit one of the customer's own packages (valid until it's assigned to a delivery courier)
export async function updateMyOrder(
  orderId: string, data: UpdateMyOrderRequest, token: string
): Promise<void> {
  return handleEmpty(await fetch(`/api/orders/${orderId}/my`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  }));
}

/// Cancel one of the customer's own packages (valid until it's assigned to a delivery courier)
export async function cancelMyOrder(orderId: string, token: string): Promise<void> {
  return handleEmpty(await fetch(`/api/orders/${orderId}/my/cancel`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  }));
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function createCustomer(data: CreateCustomerRequest, token: string): Promise<CreateCustomerResponse> {
  return handle(await fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  }));
}

export async function getCustomers(token: string, page = 1, pageSize = 20, search = ''): Promise<PagedResult<AdminCustomer>> {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(search ? { search } : {}) });
  return handle(await fetch(`/api/customers?${p}`, { headers: { Authorization: `Bearer ${token}` } }));
}

export async function getCustomerById(id: string, token: string): Promise<Customer> {
  return handle(await fetch(`/api/customers/${id}`, { headers: { Authorization: `Bearer ${token}` } }));
}

/** Admin updates a customer's profile (name, business, phone, id, and pickup address). */
export async function adminUpdateCustomer(id: string, data: UpdateCustomerRequest, token: string): Promise<void> {
  return handleEmpty(await fetch(`/api/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  }));
}

/** Admin sets a new password for a customer without knowing the old one. */
export async function adminSetCustomerPassword(
  id: string,
  data: { newPassword: string; confirmNewPassword: string },
  token: string,
): Promise<void> {
  return handleEmpty(await fetch(`/api/customers/${id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  }));
}

/** Admin assigns a customer to a white-label tenant (null = move back to root/dilo). */
export async function setCustomerTenant(
  id: string, tenantId: string | null, token: string,
): Promise<void> {
  return handleEmpty(await fetch(`/api/customers/${id}/tenant`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tenantId }),
  }));
}

/** Admin soft-deletes (deactivates) or restores (activates) a customer. */
export async function setCustomerActive(
  id: string, isActive: boolean, token: string,
): Promise<void> {
  return handleEmpty(await fetch(`/api/customers/${id}/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ isActive }),
  }));
}

export async function setCustomerCompanyPrice(
  id: string,
  prices: {
    capitalPrice: number | null; cityPrice: number | null; districtPrice: number | null;
    isCompanyServicePriceIncludedInPrice?: boolean;
  },
  token: string
): Promise<void> {
  return handleEmpty(await fetch(`/api/customers/${id}/company-price`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(prices),
  }));
}
