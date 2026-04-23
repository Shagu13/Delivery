export interface AdminOrder {
  id: string;
  trackingNumber: string;
  recipientFirstName: string;
  recipientLastName: string;
  recipientPhone: string;
  recipientCity: string;
  recipientDistrict: string;
  recipientAddress: string;
  description: string | null;
  status: string;
  isPaid: boolean;
  createdAt: string;
}

export interface AdminGroupOrder {
  id: string;
  createdAt: string;
  status: string;
  senderFirstName: string;
  senderLastName: string;
  senderIdNumber: string | null;
  senderBusinessName: string;
  senderPhone: string;
  pickUpCity: string;
  pickUpDistrict: string;
  pickUpAddress: string;
  note: string | null;
  numberOfPackages: number;
  orders: AdminOrder[];
}

export class AdminApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

export async function fetchGroupOrders(token: string, search?: string): Promise<AdminGroupOrder[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const response = await fetch(`/api/grouporders${params}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new AdminApiError(
      response.status,
      body?.title ?? `Request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<AdminGroupOrder[]>;
}
