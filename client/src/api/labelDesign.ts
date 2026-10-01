// ── The signed-in user's own saved label print settings (every role has its own) ──

/** `prefsJson` is client-owned JSON (see utils/printLabel.ts); the server only checks it is a
 *  JSON object of bounded size. */
export interface LabelDesign {
    prefsJson: string;
}

export const LABEL_DESIGN_QUERY_KEY = ['labelDesign'] as const;

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Resolves to null when this user has never saved any settings (the API answers 204). */
export async function fetchLabelDesign(token: string): Promise<LabelDesign | null> {
    const res = await fetch('/api/labeldesign', { headers: authHeaders(token), cache: 'no-store' });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`Failed to load label settings (${res.status})`);
    return res.json() as Promise<LabelDesign>;
}

export async function saveLabelDesign(design: LabelDesign, token: string): Promise<void> {
    const res = await fetch('/api/labeldesign', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(design),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.title ?? `Failed to save label settings (${res.status})`);
    }
}
