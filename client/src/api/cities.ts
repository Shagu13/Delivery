export interface City {
  id: string;
  cityName: string;
  cityNameGeo?: string;
}

export interface District {
  id: string;
  districtName: string;
  districtNameGeo?: string;
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

export async function createCity(
  cityName: string,
  cityNameGeo: string | null,
  token: string
): Promise<City> {
  const res = await fetch('/api/cities', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ cityName, cityNameGeo }),
  });
  if (res.status === 409) throw new Error('CONFLICT');
  if (!res.ok) throw new Error('Failed to create city');
  return res.json();
}

export async function createDistrict(
  cityId: string,
  districtName: string,
  districtNameGeo: string | null,
  companyServicePrice: number | null,
  token: string
): Promise<District> {
  const res = await fetch(`/api/cities/${cityId}/districts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ districtName, districtNameGeo, companyServicePrice }),
  });
  if (res.status === 409) throw new Error('CONFLICT');
  if (!res.ok) throw new Error('Failed to create district');
  return res.json();
}

export async function editCity(
  cityId: string,
  cityName: string,
  cityNameGeo: string | null,
  token: string
): Promise<void> {
  const res = await fetch(`/api/cities/${cityId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ cityName, cityNameGeo }),
  });
  if (res.status === 409) throw new Error('CONFLICT');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error('Failed to update city');
}

export async function editDistrict(
  districtId: string,
  districtName: string,
  districtNameGeo: string | null,
  companyServicePrice: number | null,
  token: string
): Promise<void> {
  const res = await fetch(`/api/cities/districts/${districtId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ districtName, districtNameGeo, companyServicePrice }),
  });
  if (res.status === 409) throw new Error('CONFLICT');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error('Failed to update district');
}

export async function deleteCity(cityId: string, token: string): Promise<void> {
  const res = await fetch(`/api/cities/${cityId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error('Failed to delete city');
}

export async function deleteDistrict(districtId: string, token: string): Promise<void> {
  const res = await fetch(`/api/cities/districts/${districtId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error('Failed to delete district');
}
