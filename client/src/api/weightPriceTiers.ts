export interface WeightPriceTier {
  id:           string;
  label:        string | null;
  minWeightKg:  number;
  maxWeightKg:  number;
  isStandard:   boolean;
  customPrice:  number | null;
  createdAt:    string;
}

export interface CreateWeightPriceTierRequest {
  label?:       string | null;
  minWeightKg:  number;
  maxWeightKg:  number;
  isStandard:   boolean;
  customPrice?: number | null;
}

export interface UpdateWeightPriceTierRequest {
  id:           string;
  label?:       string | null;
  minWeightKg:  number;
  maxWeightKg:  number;
  isStandard:   boolean;
  customPrice?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Human-readable range label, e.g. "0 – 5 kg" or "Light (0 – 5 kg)" */
export function tierLabel(tier: WeightPriceTier): string {
  const range = `${tier.minWeightKg} – ${tier.maxWeightKg} kg`;
  return tier.label ? `${tier.label} (${range})` : range;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchWeightPriceTiers(): Promise<WeightPriceTier[]> {
  const res = await fetch('/api/weightpricetiers');
  if (!res.ok) throw new Error('Failed to fetch weight price tiers');
  return res.json();
}

export async function createWeightPriceTier(
  data: CreateWeightPriceTierRequest,
  token: string,
): Promise<WeightPriceTier> {
  const res = await fetch('/api/weightpricetiers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.title ?? 'Failed to create weight price tier');
  }
  return res.json();
}

export async function updateWeightPriceTier(
  data: UpdateWeightPriceTierRequest,
  token: string,
): Promise<WeightPriceTier> {
  const res = await fetch(`/api/weightpricetiers/${data.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.title ?? 'Failed to update weight price tier');
  }
  return res.json();
}

export async function deleteWeightPriceTier(id: string, token: string): Promise<void> {
  const res = await fetch(`/api/weightpricetiers/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to delete weight price tier');
}
