// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateCustomerRequest {
  // Personal
  firstName:    string;
  lastName:     string;
  idNumber?:    string;          // optional
  businessName: string;
  phoneNumber:  string;

  // Default pickup address
  city:         string;
  district:     string;
  address:      string;

  // Login
  username:     string;
  password:     string;
}

export interface CreateCustomerResponse {
  customerId: string;
  username:   string;
  fullName:   string;
}

/**
 * Mirrors CustomerResponseDto and SenderSection form fields.
 * A Customer record can be spread directly into SenderFormData
 * with a thin field-name mapping (see CreateGroupOrderPage).
 */
export interface Customer {
  id:           string;

  // Personal
  firstName:    string;
  lastName:     string;
  idNumber:     string | null;
  businessName: string;
  phoneNumber:  string;

  // Default pickup address
  city:         string;
  district:     string;
  address:      string;

  // Account meta
  username:     string;
  isActive:     boolean;
  createdAt:    string;
}

export interface PagedResult<T> {
  items:    T[];
  total:    number;
  page:     number;
  pageSize: number;
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class CustomerApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'CustomerApiError';
  }
}

// ── Internal helper ───────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new CustomerApiError(
      res.status,
      body?.title ?? `Request failed with status ${res.status}`,
      body?.errors,
    );
  }
  return res.json() as Promise<T>;
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** Public self-registration — no token required. */
export async function registerCustomer(
  data: CreateCustomerRequest,
): Promise<CreateCustomerResponse> {
  const res = await fetch('/api/customers/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<CreateCustomerResponse>(res);
}

/** Create a customer — Admin only. */
export async function createCustomer(
  data:  CreateCustomerRequest,
  token: string,
): Promise<CreateCustomerResponse> {
  const res = await fetch('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  return handleResponse<CreateCustomerResponse>(res);
}

/**
 * Returns the Customer profile for the currently authenticated Customer.
 * Called from CreateGroupOrderPage to pre-fill SenderSection.
 * Endpoint: GET /api/customers/me
 */
export async function getMyProfile(token: string): Promise<Customer> {
  const res = await fetch('/api/customers/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse<Customer>(res);
}

/** Paginated list of customers — Admin only. */
export async function getCustomers(
  token:    string,
  page      = 1,
  pageSize  = 20,
  search    = '',
): Promise<PagedResult<Customer>> {
  const params = new URLSearchParams({
    page:     String(page),
    pageSize: String(pageSize),
    ...(search ? { search } : {}),
  });
  const res = await fetch(`/api/customers?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse<PagedResult<Customer>>(res);
}

/** Get a single customer by domain ID. */
export async function getCustomerById(
  id:    string,
  token: string,
): Promise<Customer> {
  const res = await fetch(`/api/customers/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse<Customer>(res);
}
