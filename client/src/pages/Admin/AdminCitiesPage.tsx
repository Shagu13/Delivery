import { useEffect, useRef, useState } from 'react';
import {
  type City, type District,
  fetchCities, fetchDistricts, setDistrictServicePrice, setDistrictTerritory,
  createCity, createDistrict, editCity, editDistrict,
  deleteCity, deleteDistrict,
} from '../../api/cities';
import { useLanguage } from '../../contexts/useLanguage';

interface Props {
  token: string;
}

// ── tiny shared modal shell ───────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, padding: '1.5rem',
        width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#6b7280' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── field helper ──────────────────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.45rem 0.65rem', borderRadius: 7,
  border: '1px solid #d1d5db', fontSize: '0.88rem',
};

// ── main component ────────────────────────────────────────────────────────────
export default function AdminCitiesPage({ token }: Props) {
  const { lang } = useLanguage();

  const cityLabel     = (c: City)     => (lang === 'ka' && c.cityNameGeo)     ? c.cityNameGeo     : c.cityName;
  const districtLabel = (d: District) => (lang === 'ka' && d.districtNameGeo) ? d.districtNameGeo : d.districtName;

  const [cities, setCities]               = useState<City[]>([]);
  const [citySearch, setCitySearch]       = useState('');
  const [selectedCity, setSelectedCity]   = useState<City | null>(null);
  const [districts, setDistricts]         = useState<District[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  // single-row edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving]       = useState(false);

  // multi-select bulk edit
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkValue, setBulkValue]     = useState('');
  const [bulkSaving, setBulkSaving]   = useState(false);
  const [bulkTerritorySaving, setBulkTerritorySaving] = useState(false);

  // modals
  const [showAddCity, setShowAddCity]         = useState(false);
  const [showAddDistrict, setShowAddDistrict] = useState(false);
  const [editingCity, setEditingCity]         = useState<City | null>(null);
  const [editingDistrict, setEditingDistrict] = useState<District | null>(null);
  const [deletingCity, setDeletingCity]       = useState<City | null>(null);
  const [deletingDistrict, setDeletingDistrict] = useState<District | null>(null);

  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchCities()
      .then(data => { if (!cancelled) setCities(data); })
      .catch(() => { if (!cancelled) setError('Failed to load cities'); })
      .finally(() => { if (!cancelled) setLoadingCities(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredCities = cities.filter(c =>
    cityLabel(c).toLowerCase().includes(citySearch.toLowerCase())
  );

  async function selectCity(city: City) {
    setSelectedCity(city);
    setEditingId(null);
    setSelectedIds(new Set());
    setBulkValue('');
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

  // ── single-row edit ────────────────────────────────────────────────────────

  //function startEdit(d: District) {
  //  setEditingId(d.id);
  //  setEditValue(d.companyServicePrice != null ? String(d.companyServicePrice) : '');
  //}

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

  // ── multi-select ───────────────────────────────────────────────────────────

  const allSelected  = districts.length > 0 && selectedIds.size === districts.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(districts.map(d => d.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function saveBulk() {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    setError('');
    const price = bulkValue === '' ? null : Number(bulkValue);
    try {
      await Promise.all([...selectedIds].map(id => setDistrictServicePrice(id, price, token)));
      setDistricts(prev => prev.map(d =>
        selectedIds.has(d.id) ? { ...d, companyServicePrice: price } : d
      ));
      setSelectedIds(new Set());
      setBulkValue('');
    } catch {
      setError('Failed to update one or more district prices');
    } finally {
      setBulkSaving(false);
    }
  }

  async function saveBulkTerritory(isCapital: boolean, isCity: boolean) {
    if (selectedIds.size === 0) return;
    setBulkTerritorySaving(true);
    setError('');
    try {
      await Promise.all([...selectedIds].map(id => setDistrictTerritory(id, isCapital, isCity, token)));
      setDistricts(prev => prev.map(d =>
        selectedIds.has(d.id)
          ? { ...d, isCapitalTerritory: isCapital, isCityTerritory: isCity }
          : d
      ));
      setSelectedIds(new Set());
    } catch {
      setError('Failed to update territory for one or more districts');
    } finally {
      setBulkTerritorySaving(false);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Cities &amp; Districts</h2>

      {error && (
        <p style={{ color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

        {/* ── City sidebar ─────────────────────────────────────────────────── */}
        <div style={{ minWidth: 200, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em' }}>CITIES</h3>
            <button
              onClick={() => setShowAddCity(true)}
              title="Add city"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '0.2rem 0.55rem', borderRadius: 6,
                background: '#2563eb', color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
              }}
            >
              + City
            </button>
          </div>

          {/* search */}
          <input
            type="text"
            value={citySearch}
            onChange={e => setCitySearch(e.target.value)}
            placeholder="Search cities…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '0.4rem 0.6rem', marginBottom: '0.5rem',
              borderRadius: 7, border: '1px solid #d1d5db',
              fontSize: '0.83rem',
            }}
          />

          {loadingCities ? (
            <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Loading…</p>
          ) : filteredCities.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>No cities match.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '70vh', overflowY: 'auto' }}>
              {filteredCities.map(c => (
                <li key={c.id} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                  <button
                    onClick={() => selectCity(c)}
                    style={{
                      flex: 1, textAlign: 'left',
                      padding: '0.45rem 0.75rem',
                      borderRadius: 8, border: '1px solid',
                      borderColor: selectedCity?.id === c.id ? '#2563eb' : '#e5e7eb',
                      background: selectedCity?.id === c.id ? '#eff6ff' : '#fff',
                      color: selectedCity?.id === c.id ? '#2563eb' : '#111',
                      cursor: 'pointer', fontWeight: selectedCity?.id === c.id ? 600 : 400,
                      fontSize: '0.87rem',
                    }}
                  >
                    {cityLabel(c)}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setEditingCity(c); }}
                    title="Edit city"
                    style={{
                      padding: '0.35rem 0.5rem', borderRadius: 7,
                      background: '#f3f4f6', border: '1px solid #e5e7eb',
                      cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0,
                    }}
                  >
                    ✎
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeletingCity(c); }}
                    title="Delete city"
                    style={{
                      padding: '0.35rem 0.5rem', borderRadius: 7,
                      background: '#fef2f2', border: '1px solid #fecaca',
                      cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0, color: '#dc2626',
                    }}
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── District panel ───────────────────────────────────────────────── */}
        <div style={{ flex: 1 }}>
          {!selectedCity ? (
            <p style={{ color: '#9ca3af' }}>Select a city to manage its districts.</p>
          ) : loadingDistricts ? (
            <p>Loading districts…</p>
          ) : (
            <>
              {/* heading + Add District button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em' }}>
                  DISTRICTS — {cityLabel(selectedCity).toUpperCase()}
                </h3>
                <button
                  onClick={() => setShowAddDistrict(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '0.25rem 0.65rem', borderRadius: 6,
                    background: '#2563eb', color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  }}
                >
                  + District
                </button>
              </div>

              {/* bulk action bar */}
              {selectedIds.size > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  marginBottom: '0.75rem', padding: '0.6rem 0.9rem',
                  background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
                }}>
                  <span style={{ fontSize: '0.85rem', color: '#1d4ed8', fontWeight: 500 }}>
                    {selectedIds.size} district{selectedIds.size > 1 ? 's' : ''} selected
                  </span>

                  {/* ── Price ── */}
                  <input
                    type="number"
                    value={bulkValue}
                    onChange={e => setBulkValue(e.target.value)}
                    placeholder="New price (₾)"
                    style={{ width: 130, padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid #93c5fd', fontSize: '0.85rem' }}
                  />
                  <button
                    onClick={saveBulk}
                    disabled={bulkSaving || bulkValue === ''}
                    style={{
                      padding: '0.3rem 0.8rem', borderRadius: 6,
                      background: bulkSaving || bulkValue === '' ? '#93c5fd' : '#2563eb',
                      color: '#fff', border: 'none',
                      cursor: bulkSaving || bulkValue === '' ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem', fontWeight: 500,
                    }}
                  >
                    {bulkSaving ? 'Saving…' : 'Set price'}
                  </button>

                  <span style={{ width: 1, height: 22, background: '#bfdbfe', flexShrink: 0 }} />

                  {/* ── Territory ── */}
                  <span style={{ fontSize: '0.82rem', color: '#1d4ed8', fontWeight: 500 }}>Territory:</span>
                  <button
                    onClick={() => saveBulkTerritory(true, false)}
                    disabled={bulkTerritorySaving}
                    style={{
                      padding: '0.3rem 0.75rem', borderRadius: 6,
                      background: bulkTerritorySaving ? '#fde68a' : '#fef3c7',
                      color: '#92400e', border: '1px solid #fcd34d',
                      cursor: bulkTerritorySaving ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem', fontWeight: 600,
                    }}
                  >
                    {bulkTerritorySaving ? '…' : '⭐ Capital'}
                  </button>
                  <button
                    onClick={() => saveBulkTerritory(false, true)}
                    disabled={bulkTerritorySaving}
                    style={{
                      padding: '0.3rem 0.75rem', borderRadius: 6,
                      background: bulkTerritorySaving ? '#bbf7d0' : '#dcfce7',
                      color: '#14532d', border: '1px solid #86efac',
                      cursor: bulkTerritorySaving ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem', fontWeight: 600,
                    }}
                  >
                    {bulkTerritorySaving ? '…' : '🏙 City'}
                  </button>
                  <button
                    onClick={() => saveBulkTerritory(false, false)}
                    disabled={bulkTerritorySaving}
                    style={{
                      padding: '0.3rem 0.75rem', borderRadius: 6,
                      background: bulkTerritorySaving ? '#f3f4f6' : '#f9fafb',
                      color: '#6b7280', border: '1px solid #d1d5db',
                      cursor: bulkTerritorySaving ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem', fontWeight: 600,
                    }}
                  >
                    {bulkTerritorySaving ? '…' : '🏘 District'}
                  </button>

                  <button
                    onClick={() => { setSelectedIds(new Set()); setBulkValue(''); }}
                    style={{ padding: '0.3rem 0.6rem', borderRadius: 6, background: '#e5e7eb', border: 'none', cursor: 'pointer', fontSize: '0.85rem', marginLeft: 'auto' }}
                  >
                    Clear
                  </button>
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '0.6rem 0.75rem', width: 36, borderBottom: '1px solid #ddd' }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer' }}
                        title="Select all"
                      />
                    </th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>District</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Territory</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Company Service Price (₾)</th>
                    <th style={{ padding: '0.6rem 0.75rem', width: 60, borderBottom: '1px solid #ddd' }} />
                  </tr>
                </thead>
                <tbody>
                  {districts.map(d => {
                    const isChecked = selectedIds.has(d.id);
                    return (
                      <tr key={d.id} style={{ borderBottom: '1px solid #eee', background: isChecked ? '#f0f7ff' : undefined }}>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(d.id)} style={{ cursor: 'pointer' }} />
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{districtLabel(d)}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          {d.isCapitalTerritory ? (
                            <span style={{
                              display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: 99,
                              background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                              fontSize: '0.78rem', fontWeight: 600,
                            }}>⭐ Capital</span>
                          ) : d.isCityTerritory ? (
                            <span style={{
                              display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: 99,
                              background: '#dcfce7', color: '#14532d', border: '1px solid #86efac',
                              fontSize: '0.78rem', fontWeight: 600,
                            }}>🏙 City</span>
                          ) : (
                            <span style={{
                              display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: 99,
                              background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb',
                              fontSize: '0.78rem', fontWeight: 600,
                            }}>🏘 District</span>
                          )}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          {editingId === d.id ? (
                            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input
                                type="number" value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                placeholder="null = 0"
                                style={{ width: 90, padding: '0.25rem', borderRadius: 6, border: '1px solid #ccc' }}
                              />
                              <button onClick={() => saveEdit(d.id)} disabled={saving}
                                style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                Save
                              </button>
                              <button onClick={() => setEditingId(null)}
                                style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: '#e5e7eb', border: 'none', cursor: 'pointer' }}>
                                ✕
                              </button>
                            </span>
                          ) : (
                            <span>{d.companyServicePrice != null ? `₾${d.companyServicePrice}` : <em style={{ color: '#999' }}>not set</em>}</span>
                          )}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <span style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => setEditingDistrict(d)}
                              style={{ padding: '0.2rem 0.55rem', borderRadius: 6, background: '#f3f4f6', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              ✎ Edit
                            </button>
                            <button
                              onClick={() => setDeletingDistrict(d)}
                              style={{ padding: '0.2rem 0.55rem', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', cursor: 'pointer', fontSize: '0.8rem', color: '#dc2626' }}
                            >
                              🗑 Delete
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* ── Add City modal ────────────────────────────────────────────────── */}
      {showAddCity && (
        <AddCityModal
          token={token}
          onClose={() => setShowAddCity(false)}
          onCreated={city => {
            setCities(prev => [...prev, city].sort((a, b) => a.cityName.localeCompare(b.cityName)));
            setShowAddCity(false);
            selectCity(city);
          }}
        />
      )}

      {/* ── Add District modal ────────────────────────────────────────────── */}
      {showAddDistrict && selectedCity && (
        <AddDistrictModal
          token={token}
          city={selectedCity}
          onClose={() => setShowAddDistrict(false)}
          onCreated={district => {
            setDistricts(prev => [...prev, district].sort((a, b) => a.districtName.localeCompare(b.districtName)));
            setShowAddDistrict(false);
          }}
        />
      )}

      {/* ── Edit City modal ───────────────────────────────────────────────── */}
      {editingCity && (
        <EditCityModal
          token={token}
          city={editingCity}
          onClose={() => setEditingCity(null)}
          onSaved={updated => {
            setCities(prev => prev.map(c => c.id === updated.id ? updated : c).sort((a, b) => a.cityName.localeCompare(b.cityName)));
            if (selectedCity?.id === updated.id) setSelectedCity(updated);
            setEditingCity(null);
          }}
        />
      )}

      {/* ── Edit District modal ───────────────────────────────────────────── */}
      {editingDistrict && (
        <EditDistrictModal
          token={token}
          district={editingDistrict}
          onClose={() => setEditingDistrict(null)}
          onSaved={updated => {
            setDistricts(prev => prev.map(d => d.id === updated.id ? updated : d).sort((a, b) => a.districtName.localeCompare(b.districtName)));
            setEditingDistrict(null);
          }}
        />
      )}

      {/* ── Confirm Delete City modal ─────────────────────────────────────── */}
      {deletingCity && (
        <ConfirmDeleteModal
          title="Delete City"
          message={`Are you sure you want to delete "${cityLabel(deletingCity)}"? All its districts will also be deleted.`}
          token={token}
          onClose={() => setDeletingCity(null)}
          onConfirm={async () => {
            await deleteCity(deletingCity.id, token);
            setCities(prev => prev.filter(c => c.id !== deletingCity.id));
            if (selectedCity?.id === deletingCity.id) {
              setSelectedCity(null);
              setDistricts([]);
            }
            setDeletingCity(null);
          }}
        />
      )}

      {/* ── Confirm Delete District modal ─────────────────────────────────── */}
      {deletingDistrict && (
        <ConfirmDeleteModal
          title="Delete District"
          message={`Are you sure you want to delete "${districtLabel(deletingDistrict)}"?`}
          token={token}
          onClose={() => setDeletingDistrict(null)}
          onConfirm={async () => {
            await deleteDistrict(deletingDistrict.id, token);
            setDistricts(prev => prev.filter(d => d.id !== deletingDistrict.id));
            setDeletingDistrict(null);
          }}
        />
      )}
    </div>
  );
}

// ── Add City Modal ────────────────────────────────────────────────────────────
function AddCityModal({ token, onClose, onCreated }: {
  token: string;
  onClose: () => void;
  onCreated: (city: City) => void;
}) {
  const [cityName, setCityName]       = useState('');
  const [cityNameGeo, setCityNameGeo] = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cityName.trim()) { setError('English name is required.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const city = await createCity(cityName.trim(), cityNameGeo.trim() || null, token);
      onCreated(city);
    } catch (err) {
      setError(err instanceof Error && err.message === 'CONFLICT'
        ? `A city named "${cityName}" already exists.`
        : 'Failed to create city.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add City" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="English name" required>
          <input ref={firstRef} style={INPUT} value={cityName} onChange={e => setCityName(e.target.value)} placeholder="e.g. Kutaisi" />
        </Field>
        <Field label="Georgian name">
          <input style={INPUT} value={cityNameGeo} onChange={e => setCityNameGeo(e.target.value)} placeholder="e.g. ქუთაისი" />
        </Field>
        {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#f3f4f6', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.87rem' }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            style={{ padding: '0.4rem 1rem', borderRadius: 7, background: submitting ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
            {submitting ? 'Creating…' : 'Create City'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Add District Modal ────────────────────────────────────────────────────────
function AddDistrictModal({ token, city, onClose, onCreated }: {
  token: string;
  city: City;
  onClose: () => void;
  onCreated: (district: District) => void;
}) {
  const { lang } = useLanguage();
  const cityDisplayName = (lang === 'ka' && city.cityNameGeo) ? city.cityNameGeo : city.cityName;

  const [districtName,       setDistrictName]       = useState('');
  const [districtNameGeo,    setDistrictNameGeo]    = useState('');
  const [price,              setPrice]              = useState('');
  const [isCapitalTerritory, setIsCapitalTerritory] = useState(false);
  const [isCityTerritory,    setIsCityTerritory]    = useState(false);
  const [submitting,         setSubmitting]         = useState(false);
  const [error,              setError]              = useState('');
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!districtName.trim()) { setError('English name is required.'); return; }
    if (isCapitalTerritory && isCityTerritory) {
      setError('A district cannot be both Capital Territory and City Territory.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const district = await createDistrict(
        city.id,
        districtName.trim(),
        districtNameGeo.trim() || null,
        price === '' ? null : Number(price),
        isCapitalTerritory,
        isCityTerritory,
        token,
      );
      onCreated(district);
    } catch (err) {
      setError(err instanceof Error && err.message === 'CONFLICT'
        ? `"${districtName}" already exists in ${cityDisplayName}.`
        : 'Failed to create district.');
    } finally {
      setSubmitting(false);
    }
  }

  const CHECKBOX_ROW: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '0.45rem 0.65rem', borderRadius: 7,
    border: '1px solid #d1d5db', fontSize: '0.88rem',
    cursor: 'pointer', userSelect: 'none',
  };

  return (
    <Modal title={`Add District — ${cityDisplayName}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="English name" required>
          <input ref={firstRef} style={INPUT} value={districtName} onChange={e => setDistrictName(e.target.value)} placeholder="e.g. Saburtalo" />
        </Field>
        <Field label="Georgian name">
          <input style={INPUT} value={districtNameGeo} onChange={e => setDistrictNameGeo(e.target.value)} placeholder="e.g. საბურთალო" />
        </Field>
        <Field label="Company service price (₾)">
          <input style={INPUT} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="Leave empty to set later" />
        </Field>
        <Field label="Pricing territory">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={CHECKBOX_ROW}>
              <input type="checkbox" checked={isCapitalTerritory}
                onChange={e => { setIsCapitalTerritory(e.target.checked); if (e.target.checked) setIsCityTerritory(false); }} />
              <span>Capital territory <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>(uses Capital price tier)</span></span>
            </label>
            <label style={CHECKBOX_ROW}>
              <input type="checkbox" checked={isCityTerritory}
                onChange={e => { setIsCityTerritory(e.target.checked); if (e.target.checked) setIsCapitalTerritory(false); }} />
              <span>City territory <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>(uses City price tier)</span></span>
            </label>
          </div>
        </Field>
        {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#f3f4f6', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.87rem' }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            style={{ padding: '0.4rem 1rem', borderRadius: 7, background: submitting ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
            {submitting ? 'Creating…' : 'Create District'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit City Modal ───────────────────────────────────────────────────────────
function EditCityModal({ token, city, onClose, onSaved }: {
  token: string;
  city: City;
  onClose: () => void;
  onSaved: (updated: City) => void;
}) {
  const [cityName, setCityName]       = useState(city.cityName);
  const [cityNameGeo, setCityNameGeo] = useState(city.cityNameGeo ?? '');
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cityName.trim()) { setError('English name is required.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await editCity(city.id, cityName.trim(), cityNameGeo.trim() || null, token);
      onSaved({ ...city, cityName: cityName.trim(), cityNameGeo: cityNameGeo.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error && err.message === 'CONFLICT'
        ? `A city named "${cityName}" already exists.`
        : 'Failed to update city.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Edit City" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="English name" required>
          <input ref={firstRef} style={INPUT} value={cityName} onChange={e => setCityName(e.target.value)} />
        </Field>
        <Field label="Georgian name">
          <input style={INPUT} value={cityNameGeo} onChange={e => setCityNameGeo(e.target.value)} />
        </Field>
        {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#f3f4f6', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.87rem' }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            style={{ padding: '0.4rem 1rem', borderRadius: 7, background: submitting ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit District Modal ───────────────────────────────────────────────────────
function EditDistrictModal({ token, district, onClose, onSaved }: {
  token: string;
  district: District;
  onClose: () => void;
  onSaved: (updated: District) => void;
}) {
  const [districtName,       setDistrictName]       = useState(district.districtName);
  const [districtNameGeo,    setDistrictNameGeo]    = useState(district.districtNameGeo ?? '');
  const [price,              setPrice]              = useState(district.companyServicePrice != null ? String(district.companyServicePrice) : '');
  const [isCapitalTerritory, setIsCapitalTerritory] = useState(district.isCapitalTerritory);
  const [isCityTerritory,    setIsCityTerritory]    = useState(district.isCityTerritory);
  const [submitting,         setSubmitting]         = useState(false);
  const [error,              setError]              = useState('');
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!districtName.trim()) { setError('English name is required.'); return; }
    if (isCapitalTerritory && isCityTerritory) {
      setError('A district cannot be both Capital Territory and City Territory.');
      return;
    }
    setSubmitting(true);
    setError('');
    const newPrice = price === '' ? null : Number(price);
    try {
      await editDistrict(district.id, districtName.trim(), districtNameGeo.trim() || null, newPrice, isCapitalTerritory, isCityTerritory, token);
      onSaved({ ...district, districtName: districtName.trim(), districtNameGeo: districtNameGeo.trim() || undefined, companyServicePrice: newPrice, isCapitalTerritory, isCityTerritory });
    } catch (err) {
      setError(err instanceof Error && err.message === 'CONFLICT'
        ? `A district named "${districtName}" already exists in this city.`
        : 'Failed to update district.');
    } finally {
      setSubmitting(false);
    }
  }

  const CHECKBOX_ROW: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '0.45rem 0.65rem', borderRadius: 7,
    border: '1px solid #d1d5db', fontSize: '0.88rem',
    cursor: 'pointer', userSelect: 'none',
  };

  return (
    <Modal title="Edit District" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="English name" required>
          <input ref={firstRef} style={INPUT} value={districtName} onChange={e => setDistrictName(e.target.value)} />
        </Field>
        <Field label="Georgian name">
          <input style={INPUT} value={districtNameGeo} onChange={e => setDistrictNameGeo(e.target.value)} />
        </Field>
        <Field label="Company service price (₾)">
          <input style={INPUT} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="Leave empty to clear" />
        </Field>
        <Field label="Pricing territory">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={CHECKBOX_ROW}>
              <input type="checkbox" checked={isCapitalTerritory}
                onChange={e => { setIsCapitalTerritory(e.target.checked); if (e.target.checked) setIsCityTerritory(false); }} />
              <span>Capital territory <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>(uses Capital price tier)</span></span>
            </label>
            <label style={CHECKBOX_ROW}>
              <input type="checkbox" checked={isCityTerritory}
                onChange={e => { setIsCityTerritory(e.target.checked); if (e.target.checked) setIsCapitalTerritory(false); }} />
              <span>City territory <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>(uses City price tier)</span></span>
            </label>
          </div>
        </Field>
        {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#f3f4f6', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.87rem' }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            style={{ padding: '0.4rem 1rem', borderRadius: 7, background: submitting ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Confirm Delete Modal ──────────────────────────────────────────────────────
function ConfirmDeleteModal({ title, message, token: _token, onClose, onConfirm }: {
  title: string;
  message: string;
  token: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState('');

  async function handleConfirm() {
    setDeleting(true);
    setError('');
    try {
      await onConfirm();
    } catch {
      setError('Failed to delete. Please try again.');
      setDeleting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: '#374151' }}>{message}</p>
      {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={deleting}
          style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#f3f4f6', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.87rem' }}>
          Cancel
        </button>
        <button onClick={handleConfirm} disabled={deleting}
          style={{ padding: '0.4rem 1rem', borderRadius: 7, background: deleting ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}