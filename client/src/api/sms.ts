const API = import.meta.env.VITE_API_URL ?? '';

export async function fetchSmsBalance(token: string): Promise<number> {
  const res = await fetch(`${API}/api/sms/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error('Failed to fetch SMS balance');

  const data = await res.json() as { credits: number };
  return data.credits;
}
