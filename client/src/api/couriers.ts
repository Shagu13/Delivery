export interface CreateCourierRequest {
  firstName: string;
  lastName: string;
  idNumber: string;
  phoneNumber: string;
  assignedCity: string;
  assignedDistrict: string;
  username: string;
  password: string;
}

export interface CreateCourierResponse {
  courierId: string;
  username: string;
  fullName: string;
}

/// Full courier record as returned by GET /api/couriers
export interface Courier {
  courierId: string;
  fullName: string;
  username: string;
  assignedCity: string;
  assignedDistrict: string;
  phoneNumber: string;
  isAvailable: boolean;
}

export class CourierApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'CourierApiError';
  }
}

export async function createCourier(
  data: CreateCourierRequest,
  token: string,
): Promise<CreateCourierResponse> {
  const response = await fetch('/api/couriers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new CourierApiError(
      response.status,
      body?.title ?? `Request failed with status ${response.status}`,
      body?.errors,
    );
  }

  return response.json() as Promise<CreateCourierResponse>;
}

export async function fetchCouriers(): Promise<Courier[]> {
  const res = await fetch('/api/couriers', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch couriers');
  return res.json();
}
