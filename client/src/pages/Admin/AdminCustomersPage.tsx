import { useEffect, useState } from 'react';
import {
  type AdminCustomer,
  getCustomers,
  setCustomerCompanyPrice,
} from '../../api/customers';

interface Props {
  token: string;
}

export default function AdminCustomersPage({ token }: Props) {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const PAGE_SIZE = 20;

  async function load(p = page, q = search) {
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
  }

  useEffect(() => { load(1, search); setPage(1); }, [search]);

  function startEdit(c: AdminCustomer) {
    setEditingId(c.id);
    setEditValue(c.companyPriceToDeliverPackages != null ? String(c.companyPriceToDeliverPackages) : '');
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const price = editValue === '' ? null : Number(editValue);
      await setCustomerCompanyPrice(id, price, token);
      setCustomers(prev => prev.map(c =>
        c.id === id ? { ...c, companyPriceToDeliverPackages: price } : c
      ));
      setEditingId(null);
    } catch {
      setError('Failed to save price');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Customers</h2>

      <input
        type="text"
        placeholder="Search by name, business, city, email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          padding: '0.5rem 0.75rem',
          borderRadius: 8,
          border: '1px solid #ddd',
          width: '100%',
          maxWidth: 400,
          marginBottom: '1rem',
          fontSize: '0.9rem',
        }}
      />

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              {['Business', 'Name', 'Phone', 'City', 'District', 'Email', 'Active', 'Company Price (₾)'].map(h => (
                <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>{h}</th>
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
                <td style={{ padding: '0.6rem 0.75rem' }}>
                  {editingId === c.id ? (
                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        placeholder="null = default"
                        style={{ width: 90, padding: '0.25rem', borderRadius: 6, border: '1px solid #ccc' }}
                      />
                      <button
                        onClick={() => saveEdit(c.id)}
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
                      <span>{c.companyPriceToDeliverPackages != null ? `₾${c.companyPriceToDeliverPackages}` : <em style={{ color: '#999' }}>default</em>}</span>
                      <button
                        onClick={() => startEdit(c)}
                        style={{ padding: '0.2rem 0.5rem', borderRadius: 6, background: '#f3f4f6', border: '1px solid #ddd', cursor: 'pointer', fontSize: '0.8rem' }}
                      >Edit</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: '1rem', alignItems: 'center' }}>
        <button
          disabled={page <= 1}
          onClick={() => { const p = page - 1; setPage(p); load(p); }}
          style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}
        >← Prev</button>
        <span>Page {page} / {totalPages}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => { const p = page + 1; setPage(p); load(p); }}
          style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }}
        >Next →</button>
      </div>
    </div>
  );
}
