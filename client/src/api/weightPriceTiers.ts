export interface WeightPriceTier {
    id: string;
    label: string | null;
    minWeightKg: number;
    maxWeightKg: number;
    capitalPrice: number | null;
    cityPrice: number | null;
    districtPrice: number | null;
    createdAt: string;
}

export interface CreateWeightPriceTierRequest {
    label?: string | null;
    minWeightKg: number;
    maxWeightKg: number;
    capitalPrice?: number | null;
    cityPrice?: number | null;
    districtPrice?: number | null;
}

export interface UpdateWeightPriceTierRequest {
    id: string;
    label?: string | null;
    minWeightKg: number;
    maxWeightKg: number;
    capitalPrice?: number | null;
    cityPrice?: number | null;
    districtPrice?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Human-readable range label, e.g. "0 – 5 კგ" */
export function tierLabel(tier: WeightPriceTier): string {
    return `${tier.minWeightKg} – ${tier.maxWeightKg} კგ`;
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
