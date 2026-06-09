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
}

export interface AdminCustomer extends Customer {
  companyServiceCapitalPrice:  number | null;
  companyServiceCityPrice:     number | null;
  companyServiceDistrictPrice: number | null;
}

export interface PagedResult<T> {
  items: T[]; totalCount: number; page: number; pageSize: number; totalPages: number;
  hasNextPage: boolean; hasPreviousPage: boolean;
}

// ── Order types ───────────────────────────────────────────────────────────────

export interface CustomerOrder {
  id: string; trackingNumber: string;
  recipientFirstName: string; recipientLastName: string;
  recipientPhone: string; recipientCity: string; recipientCityGeo?: string;
  recipientDistrict: string; recipientDistrictGeo?: string; recipientAddress: string;
  description: string | null; status: string;
  orderType: 'Send' | 'Return' | 'Exchange';
  productPaymentStatus: 'NotPaid' | 'Paid'; createdAt: string;
  companyServicePrice?: number;
  amountToCollectForPackage?: number | null;
}

export interface CustomerGroupOrder {
  id: string; createdAt: string; status: string;
  senderBusinessName: string;
  pickUpCity: string; pickUpCityGeo?: string;
  pickUpDistrict: string; pickUpDistrictGeo?: string;
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

export async function setCustomerCompanyPrice(
  id: string,
  prices: { capitalPrice: number | null; cityPrice: number | null; districtPrice: number | null },
  token: string
): Promise<void> {
  return handleEmpty(await fetch(`/api/customers/${id}/company-price`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(prices),
  }));
}
