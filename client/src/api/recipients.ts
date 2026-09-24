import type { PagedResult } from '../types/paging';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One unique recipient — deduped by phone across every customer's order history. Not a
 *  saved entity: there is no Recipient table, this is a live aggregate over past orders. */
export interface RecipientDirectoryItem {
  recipientPhone: string;
  recipientName: string;
  recipientCity: string;
  recipientDistrict: string;
  recipientAddress: string;
  orderCount: number;
  lastOrderAt: string;
}

/** One past order sent to a given recipient phone — the directory drill-down. */
export interface RecipientOrderHistoryItem {
  id: string;
  trackingNumber: string;
  orderType: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  senderDisplayName: string;
  recipientCity: string;
  recipientDistrict: string;
  recipientAddress: string;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Admin/Operator ────────────────────────────────────────────────────────────

/** Company-wide recipient directory, searchable by name, phone, or address. */
export async function fetchRecipients(
  token: string, page = 1, pageSize = 20, search = '',
): Promise<PagedResult<RecipientDirectoryItem>> {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(search ? { search } : {}) });
  return handle(await fetch(`/api/recipients?${qs}`, { headers: { Authorization: `Bearer ${token}` } }));
}

/** Every order sent to one recipient phone, most recent first. */
export async function fetchRecipientOrderHistory(
  token: string, phone: string,
): Promise<RecipientOrderHistoryItem[]> {
  return handle(await fetch(`/api/recipients/${encodeURIComponent(phone)}/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  }));
}
