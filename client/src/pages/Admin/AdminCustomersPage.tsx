import { useCallback, useEffect, useState } from 'react';
import {
  type AdminCustomer,
  getCustomers,
  setCustomerCompanyPrice,
} from '../../api/customers';

interface Props {
  token: string;
}

interface EditState {
  capitalPrice:  string;
  cityPrice:     string;
  districtPrice: string;
}

function priceDisplay(v: number | null) {
  return v != null ? `₾${v}` : <em style={{ color: '#999' }}>default</em>;
}

export default function AdminCustomersPage({ token }: Props) {
  const [customers, setCustomers]       = useState<AdminCustomer[]>([]);
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [loading, setLoading]           = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editState, setEditState]       = useState<EditState>({ capitalPrice: '', cityPrice: '', districtPrice: '' });
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  const PAGE_SIZE = 20;

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true);
    try {
      const result = await getCustomers(token, p, PAGE_SIZE, q);
      setCustomers(result.items as AdminCustomer[]);
      setTotalPages(result.totalPages || 1);
    } catch {
      setError('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(1, search); }, [search, load]);

  function startEdit(c: AdminCustomer) {
    setEditingId(c.id);
    setEditState({
      capitalPrice:  c.companyServiceCapitalPrice  != null ? String(c.companyServiceCapitalPrice)  : '',
      cityPrice:     c.companyServiceCityPrice     != null ? String(c.companyServiceCityPrice)     : '',
      districtPrice: c.companyServiceDistrictPrice != null ? String(c.companyServiceDistrictPrice) : '',
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const parse = (v: string) => v === '' ? null : Number(v);
      const prices = {
        capitalPrice:  parse(editState.capitalPrice),
        cityPrice:     parse(editState.cityPrice),
        districtPrice: parse(editState.districtPrice),
      };
      await setCustomerCompanyPrice(id, prices, token);
      setCustomers(prev => prev.map(c =>
        c.id === id ? {
          ...c,
          companyServiceCapitalPrice:  prices.capitalPrice,
          companyServiceCityPrice:     prices.cityPrice,
          companyServiceDistrictPrice: prices.districtPrice,
        } : c
      ));
      setEditingId(null);
    } catch {
      setError('Failed to save prices');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: 80, padding: '0.25rem', borderRadius: 6,
    border: '1px solid #ccc', fontSize: '0.82rem',
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Customers</h2>

      <input
        type="text"
        placeholder="Search by name, business, city, email…"
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{
          padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #ddd',
          width: '100%', maxWidth: 400, marginBottom: '1rem', fontSize: '0.9rem',
        }}
      />

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              {[
                'Business', 'Name', 'Phone', 'City', 'District', 'Email', 'Active',
                'Capital (₾)', 'City (₾)', 'District (₾)', '',
              ].map((h, i) => (
                <th key={i} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.businessName}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.firstName} {c.lastName}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.phoneNumber}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.city}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.district}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.email}</td>
                <td style={{ padding: '0.6rem 0.75rem' }}>{c.isActive ? '✓' : '✗'}</td>

                {editingId === c.id ? (
                  <>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <input
                        type="number" style={inputStyle} value={editState.capitalPrice}
                        placeholder="null"
                        onChange={e => setEditState(s => ({ ...s, capitalPrice: e.target.value }))}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <input
                        type="number" style={inputStyle} value={editState.cityPrice}
                        placeholder="null"
                        onChange={e => setEditState(s => ({ ...s, cityPrice: e.target.value }))}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <input
                        type="number" style={inputStyle} value={editState.districtPrice}
                        placeholder="null"
                        onChange={e => setEditState(s => ({ ...s, districtPrice: e.target.value }))}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button
                          onClick={() => saveEdit(c.id)} disabled={saving}
                          style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
                        >Save</button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: '#e5e7eb', border: 'none', cursor: 'pointer' }}
                        >✕</button>
                      </span>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{priceDisplay(c.companyServiceCapitalPrice)}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{priceDisplay(c.companyServiceCityPrice)}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{priceDisplay(c.companyServiceDistrictPrice)}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <button
                        onClick={() => startEdit(c)}
                        style={{ padding: '0.2rem 0.5rem', borderRadius: 6, background: '#f3f4f6', border: '1px solid #ddd', cursor: 'pointer', fontSize: '0.8rem' }}
                      >Edit</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: '1rem', alignItems: 'center' }}>
        <button
          disabled={page <= 1}
          onClick={() => { const p = page - 1; setPage(p); void load(p, search); }}
          style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}
        >← Prev</button>
        <span>Page {page} / {totalPages}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => { const p = page + 1; setPage(p); void load(p, search); }}
          style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}
        >Next →</button>
      </div>
    </div>
  );
}
