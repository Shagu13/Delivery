// Admin-facing API for managing partner API keys and webhooks.

// ── Types ───────────────────────────────────────────────────────────────────────

export interface PartnerApiKey {
  id: string;
  customerId: string;
  customerBusinessName: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Returned once on creation — `apiKey` is the raw secret, never retrievable again. */
export interface IssuedApiKey {
  id: string;
  customerId: string;
  name: string;
  keyPrefix: string;
  apiKey: string;
}

export interface PartnerWebhook {
  id: string;
  customerId: string;
  customerBusinessName: string;
  url: string;
  secret: string;
  isActive: boolean;
  createdAt: string;
}

// ── Error handling (mirrors other api/*.ts files) ───────────────────────────────

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.title ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function handleEmpty(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.title ?? `Request failed with status ${res.status}`);
  }
}

// ── API keys ─────────────────────────────────────────────────────────────────────

export async function getPartnerApiKeys(token: string, customerId?: string): Promise<PartnerApiKey[]> {
  const q = customerId ? `?customerId=${customerId}` : '';
  return handle(await fetch(`/api/partnerapikeys${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  }));
}

export async function issuePartnerApiKey(
  data: { customerId: string; name: string }, token: string,
): Promise<IssuedApiKey> {
  return handle(await fetch('/api/partnerapikeys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  }));
}

export async function revokePartnerApiKey(id: string, token: string): Promise<void> {
  return handleEmpty(await fetch(`/api/partnerapikeys/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }));
}

// ── Webhooks ─────────────────────────────────────────────────────────────────────

export async function getPartnerWebhooks(token: string, customerId?: string): Promise<PartnerWebhook[]> {
  const q = customerId ? `?customerId=${customerId}` : '';
  return handle(await fetch(`/api/partnerwebhooks${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  }));
}

export async function createPartnerWebhook(
  data: { customerId: string; url: string }, token: string,
): Promise<PartnerWebhook> {
  return handle(await fetch('/api/partnerwebhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  }));
}

export async function deletePartnerWebhook(id: string, token: string): Promise<void> {
  return handleEmpty(await fetch(`/api/partnerwebhooks/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }));
}
