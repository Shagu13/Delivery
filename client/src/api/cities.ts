export interface City {
  id: string;
  cityName: string;
}

export interface District {
  id: string;
  districtName: string;
  companyServicePrice: number | null;
}

export async function fetchCities(): Promise<City[]> {
  const res = await fetch('/api/cities');
  if (!res.ok) throw new Error('Failed to fetch cities');
  return res.json();
}

export async function fetchDistricts(cityId: string): Promise<District[]> {
  const res = await fetch(`/api/cities/${cityId}/districts`);
  if (!res.ok) throw new Error('Failed to fetch districts');
  return res.json();
}

export async function setDistrictServicePrice(
  districtId: string,
  price: number | null,
  token: string
): Promise<void> {
  const res = await fetch(`/api/cities/districts/${districtId}/service-price`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ price }),
  });
  if (!res.ok) throw new Error('Failed to update district service price');
}
