import { useEffect, useState } from 'react';
import { type City, type District, fetchCities, fetchDistricts, setDistrictServicePrice } from '../../api/cities';

interface Props {
  token: string;
}

export default function AdminCitiesPage({ token }: Props) {
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoadingCities(true);
    fetchCities()
      .then(setCities)
      .catch(() => setError('Failed to load cities'))
      .finally(() => setLoadingCities(false));
  }, []);

  async function selectCity(city: City) {
    setSelectedCity(city);
    setEditingId(null);
    setLoadingDistricts(true);
    try {
      const d = await fetchDistricts(city.id);
      setDistricts(d);
    } catch {
      setError('Failed to load districts');
    } finally {
      setLoadingDistricts(false);
    }
  }

  function startEdit(d: District) {
    setEditingId(d.id);
    setEditValue(d.companyServicePrice != null ? String(d.companyServicePrice) : '');
  }

  async function saveEdit(districtId: string) {
    setSaving(true);
    try {
      const price = editValue === '' ? null : Number(editValue);
      await setDistrictServicePrice(districtId, price, token);
      setDistricts(prev => prev.map(d =>
        d.id === districtId ? { ...d, companyServicePrice: price } : d
      ));
      setEditingId(null);
    } catch {
      setError('Failed to save district price');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Cities &amp; Districts</h2>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        {/* City list */}
        <div style={{ minWidth: 180 }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#6b7280' }}>CITIES</h3>
          {loadingCities ? (
            <p>Loading…</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {cities.map(c => (
                <li key={c.id}>
                  <button
                    onClick={() => selectCity(c)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      marginBottom: 4,
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: selectedCity?.id === c.id ? '#2563eb' : '#e5e7eb',
                      background: selectedCity?.id === c.id ? '#eff6ff' : '#fff',
                      color: selectedCity?.id === c.id ? '#2563eb' : '#111',
                      cursor: 'pointer',
                      fontWeight: selectedCity?.id === c.id ? 600 : 400,
                    }}
                  >
                    {c.cityName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* District table */}
        <div style={{ flex: 1 }}>
          {!selectedCity ? (
            <p style={{ color: '#9ca3af' }}>Select a city to manage its districts.</p>
          ) : loadingDistricts ? (
            <p>Loading districts…</p>
          ) : (
            <>
              <h3 style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: '#6b7280' }}>
                DISTRICTS — {selectedCity.cityName.toUpperCase()}
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>District</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Company Service Price (₾)</th>
                  </tr>
                </thead>
                <tbody>
                  {districts.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '0.6rem 0.75rem' }}>{d.districtName}</td>
                      <td style={{ padding: '0.6rem 0.75rem' }}>
                        {editingId === d.id ? (
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              type="number"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              placeholder="null = 0"
                              style={{ width: 90, padding: '0.25rem', borderRadius: 6, border: '1px solid #ccc' }}
                            />
                            <button
                              onClick={() => saveEdit(d.id)}
                              disabled={saving}
                              style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
                            >Save</button>
                            <button
                              onClick={() => setEditingId(null)}
                              style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: '#e5e7eb', border: 'none', cursor: 'pointer' }}
                            >✕</button>
                          </span>
                        ) : (
                          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span>{d.companyServicePrice != null ? `₾${d.companyServicePrice}` : <em style={{ color: '#999' }}>not set</em>}</span>
                            <button
                              onClick={() => startEdit(d)}
                              style={{ padding: '0.2rem 0.5rem', borderRadius: 6, background: '#f3f4f6', border: '1px solid #ddd', cursor: 'pointer', fontSize: '0.8rem' }}
                            >Edit</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
