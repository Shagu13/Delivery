import React, { useEffect, useRef, useState } from 'react';
import {
  type City, type District, type DeliverySchedule,
  fetchCities, fetchDistricts, setDistrictServicePrice, setDistrictTerritory,
  createCity, createDistrict, editCity, editDistrict,
  deleteCity, deleteDistrict,
  fetchDeletedCities, fetchDeletedDistricts, restoreCity, restoreDistrict,
  fetchCityDeliverySchedule, setCityDeliverySchedule,
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
        background: 'var(--color-bg-2)', borderRadius: 12, padding: '1.5rem',
        width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--color-text-muted)' }}>✕</button>
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
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
        {label}{required && <span style={{ color: 'var(--color-error)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.45rem 0.65rem', borderRadius: 7,
  border: '1px solid var(--color-border)', fontSize: '0.88rem',
};

// ── main component ────────────────────────────────────────────────────────────
export default function AdminCitiesPage({ token }: Props) {
  const { lang, t } = useLanguage();

  const cityLabel     = (c: City)     => (lang === 'ka' && c.cityNameGeo)     ? c.cityNameGeo     : c.cityName;
  const districtLabel = (d: District) => (lang === 'ka' && d.districtNameGeo) ? d.districtNameGeo : d.districtName;

  const [cities, setCities]               = useState<City[]>([]);
  const [citySearch, setCitySearch]       = useState('');
  const [selectedCity, setSelectedCity]   = useState<City | null>(null);
  const [districts, setDistricts]         = useState<District[]>([]);
  const [districtSearch, setDistrictSearch] = useState('');
  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  // soft-deleted / restore
  const [showDeletedCities, setShowDeletedCities]     = useState(false);
  const [deletedCities, setDeletedCities]             = useState<City[]>([]);
  const [loadingDeletedCities, setLoadingDeletedCities] = useState(false);
  const [showDeletedDistricts, setShowDeletedDistricts] = useState(false);
  const [deletedDistricts, setDeletedDistricts]       = useState<District[]>([]);
  const [loadingDeletedDistricts, setLoadingDeletedDistricts] = useState(false);
  const [restoringCity, setRestoringCity]             = useState<City | null>(null);
  const [restoringDistrict, setRestoringDistrict]     = useState<District | null>(null);

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
  const [schedulingCity, setSchedulingCity]   = useState<City | null>(null);
  const [editingDistrict, setEditingDistrict] = useState<District | null>(null);
  const [deletingCity, setDeletingCity]       = useState<City | null>(null);
  const [deletingDistrict, setDeletingDistrict] = useState<District | null>(null);

  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchCities()
      .then(data => { if (!cancelled) setCities(data); })
      .catch(() => { if (!cancelled) setError(t.acpLoadFailed); })
      .finally(() => { if (!cancelled) setLoadingCities(false); });
    return () => { cancelled = true; };
  }, []);

  const matchesCity = (c: City) =>
    cityLabel(c).toLowerCase().includes(citySearch.toLowerCase()) ||
    c.cityName.toLowerCase().includes(citySearch.toLowerCase()) ||
    (c.cityNameGeo ?? '').toLowerCase().includes(citySearch.toLowerCase());

  const filteredCities        = cities.filter(matchesCity);
  const filteredDeletedCities = deletedCities.filter(matchesCity);

  const filteredDistricts = districts.filter(d =>
    districtLabel(d).toLowerCase().includes(districtSearch.toLowerCase()) ||
    d.districtName.toLowerCase().includes(districtSearch.toLowerCase()) ||
    (d.districtNameGeo ?? '').toLowerCase().includes(districtSearch.toLowerCase())
  );

  async function selectCity(city: City) {
    setSelectedCity(city);
    setEditingId(null);
    setSelectedIds(new Set());
    setBulkValue('');
    setDistrictSearch('');
    setShowDeletedDistricts(false);
    setDeletedDistricts([]);
    setLoadingDistricts(true);
    try {
      const d = await fetchDistricts(city.id);
      setDistricts(d);
    } catch {
      setError(t.acpLoadDistrictsFailed);
    } finally {
      setLoadingDistricts(false);
    }
  }

  // ── soft-deleted views ───────────────────────────────────────────────────────

  async function toggleDeletedCities() {
    const next = !showDeletedCities;
    setShowDeletedCities(next);
    if (next) {
      setLoadingDeletedCities(true);
      setError('');
      try {
        setDeletedCities(await fetchDeletedCities(token));
      } catch {
        setError(t.acpLoadFailed);
      } finally {
        setLoadingDeletedCities(false);
      }
    }
  }

  async function toggleDeletedDistricts() {
    if (!selectedCity) return;
    const next = !showDeletedDistricts;
    setShowDeletedDistricts(next);
    if (next) {
      setLoadingDeletedDistricts(true);
      setError('');
      try {
        setDeletedDistricts(await fetchDeletedDistricts(selectedCity.id, token));
      } catch {
        setError(t.acpLoadDistrictsFailed);
      } finally {
        setLoadingDeletedDistricts(false);
      }
    }
  }

  async function confirmRestoreCity(city: City) {
    await restoreCity(city.id, token);
    setDeletedCities(prev => prev.filter(c => c.id !== city.id));
    setCities(prev => [...prev, city].sort((a, b) => a.cityName.localeCompare(b.cityName)));
    setRestoringCity(null);
  }

  async function confirmRestoreDistrict(district: District) {
    await restoreDistrict(district.id, token);
    setDeletedDistricts(prev => prev.filter(d => d.id !== district.id));
    if (selectedCity) {
      setDistricts(prev => [...prev, district].sort((a, b) => a.districtName.localeCompare(b.districtName)));
    }
    setRestoringDistrict(null);
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
      setError(t.acpSaveDistrictPriceFail);
    } finally {
      setSaving(false);
    }
  }

  // ── multi-select ───────────────────────────────────────────────────────────

  const allSelected  = filteredDistricts.length > 0 && filteredDistricts.every(d => selectedIds.has(d.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDistricts.map(d => d.id)));
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
      setError(t.acpBulkPriceUpdateFail);
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
      setError(t.acpBulkTerritoryFail);
    } finally {
      setBulkTerritorySaving(false);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 1.5rem)' }}>
      <style>{`
        /* On phones the city / district master-detail stacks vertically instead of
           sitting side-by-side, and the city list takes the full width. */
        @media (max-width: 768px) {
          .acp-layout { flex-direction: column; gap: 1.25rem !important; }
          .acp-sidebar { min-width: 0 !important; width: 100%; }
        }
      `}</style>
      <h2 style={{ marginBottom: '1rem' }}>{t.acpTitle}</h2>

      {error && (
        <p style={{ color: 'var(--color-error)', background: 'var(--color-error-bg)', border: '1px solid var(--color-error)', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      <div className="acp-layout" style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

        {/* ── City sidebar ─────────────────────────────────────────────────── */}
        <div className="acp-sidebar" style={{ minWidth: 200, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>{t.acpCitiesHeader}</h3>
            <button
              onClick={() => setShowAddCity(true)}
              title={t.acpAddCityBtn}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '0.2rem 0.55rem', borderRadius: 6,
                background: 'var(--color-accent)', color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
              }}
            >
              {t.acpAddCityBtn}
            </button>
          </div>

          {/* search */}
          <input
            type="text"
            value={citySearch}
            onChange={e => setCitySearch(e.target.value)}
            placeholder={t.acpSearchCitiesPh}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '0.4rem 0.6rem', marginBottom: '0.5rem',
              borderRadius: 7, border: '1px solid var(--color-border)',
              fontSize: '0.83rem',
            }}
          />

          {/* show deleted toggle */}
          <button
            onClick={toggleDeletedCities}
            style={{
              display: 'block', width: '100%', marginBottom: '0.6rem',
              padding: '0.3rem 0.5rem', borderRadius: 6,
              background: showDeletedCities ? 'var(--color-error-bg)' : 'var(--color-bg-3)',
              border: `1px solid ${showDeletedCities ? 'var(--color-error)' : 'var(--color-border)'}`,
              color: showDeletedCities ? 'var(--color-error)' : 'var(--color-text-muted)',
              cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
            }}
          >
            {showDeletedCities ? `← ${t.acpShowActiveCities}` : `🗑 ${t.acpShowDeletedCities}`}
          </button>

          {showDeletedCities ? (
            loadingDeletedCities ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>Loading…</p>
            ) : filteredDeletedCities.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>{t.acpNoDeletedCities}</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '70vh', overflowY: 'auto' }}>
                {filteredDeletedCities.map(c => (
                  <li key={c.id} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{
                      flex: 1, padding: '0.45rem 0.75rem', borderRadius: 8,
                      border: '1px solid var(--color-border)', background: 'var(--color-bg-3)',
                      color: 'var(--color-text-muted)', fontSize: '0.87rem', textDecoration: 'line-through',
                    }}>
                      {cityLabel(c)}
                    </span>
                    <button
                      onClick={() => setRestoringCity(c)}
                      title={t.acpActivate}
                      style={{
                        padding: '0.35rem 0.6rem', borderRadius: 7,
                        background: 'var(--color-success-bg)', border: '1px solid var(--color-success)',
                        cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0,
                        color: 'var(--color-success)', fontWeight: 600,
                      }}
                    >
                      ↩ {t.acpActivate}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : loadingCities ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>Loading…</p>
          ) : filteredCities.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>{t.acpNoCitiesMatch}</p>
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
                      borderColor: selectedCity?.id === c.id ? 'var(--color-accent)' : 'var(--color-border)',
                      background: selectedCity?.id === c.id ? 'var(--color-accent-dim)' : 'var(--color-bg-2)',
                      color: selectedCity?.id === c.id ? 'var(--color-accent)' : 'var(--color-text)',
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
                      background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
                      cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0,
                    }}
                  >
                    ✎
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setSchedulingCity(c); }}
                    title={t.acpScheduleBtn}
                    style={{
                      padding: '0.35rem 0.5rem', borderRadius: 7,
                      background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
                      cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0,
                    }}
                  >
                    🗓
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeletingCity(c); }}
                    title="Delete city"
                    style={{
                      padding: '0.35rem 0.5rem', borderRadius: 7,
                      background: 'var(--color-error-bg)', border: '1px solid var(--color-error)',
                      cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0, color: 'var(--color-error)',
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
            <p style={{ color: 'var(--color-text-subtle)' }}>{t.acpSelectCityHint}</p>
          ) : loadingDistricts ? (
            <p>Loading districts…</p>
          ) : (
            <>
              {/* heading + Add District button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
                  {t.acpThDistrict.toUpperCase()} — {cityLabel(selectedCity).toUpperCase()}
                </h3>
                <button
                  onClick={() => setShowAddDistrict(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '0.25rem 0.65rem', borderRadius: 6,
                    background: 'var(--color-accent)', color: '#fff',
                    border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  }}
                >
                  {t.acpAddDistrictBtn}
                </button>
              </div>

              {/* district search + deleted toggle */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  value={districtSearch}
                  onChange={e => setDistrictSearch(e.target.value)}
                  placeholder={t.acpSearchDistrictsPh}
                  style={{
                    flex: 1, boxSizing: 'border-box',
                    padding: '0.4rem 0.6rem', borderRadius: 7,
                    border: '1px solid var(--color-border)', fontSize: '0.83rem',
                  }}
                />
                <button
                  onClick={toggleDeletedDistricts}
                  style={{
                    flexShrink: 0, padding: '0.4rem 0.7rem', borderRadius: 7,
                    background: showDeletedDistricts ? 'var(--color-error-bg)' : 'var(--color-bg-3)',
                    border: `1px solid ${showDeletedDistricts ? 'var(--color-error)' : 'var(--color-border)'}`,
                    color: showDeletedDistricts ? 'var(--color-error)' : 'var(--color-text-muted)',
                    cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap',
                  }}
                >
                  {showDeletedDistricts ? t.acpHideDeletedDistricts : `🗑 ${t.acpShowDeletedDistricts}`}
                </button>
              </div>

              {/* bulk action bar */}
              {selectedIds.size > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  marginBottom: '0.75rem', padding: '0.6rem 0.9rem',
                  background: 'var(--color-accent-dim)', border: '1px solid var(--color-accent)', borderRadius: 8,
                }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-accent)', fontWeight: 500 }}>
                    {t.acpNDistrictsSelected(selectedIds.size)}
                  </span>

                  {/* ── Price ── */}
                  <input
                    type="number"
                    value={bulkValue}
                    onChange={e => setBulkValue(e.target.value)}
                    placeholder={t.acpNewPricePh}
                    style={{ width: 130, padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-accent)', fontSize: '0.85rem' }}
                  />
                  <button
                    onClick={saveBulk}
                    disabled={bulkSaving || bulkValue === ''}
                    style={{
                      padding: '0.3rem 0.8rem', borderRadius: 6,
                      background: bulkSaving || bulkValue === '' ? 'var(--color-accent)' : 'var(--color-accent)',
                      color: '#fff', border: 'none',
                      cursor: bulkSaving || bulkValue === '' ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem', fontWeight: 500,
                    }}
                  >
                    {bulkSaving ? t.loading : t.acpSetPrice}
                  </button>

                  <span style={{ width: 1, height: 22, background: 'var(--color-accent)', flexShrink: 0 }} />

                  {/* ── Territory ── */}
                  <span style={{ fontSize: '0.82rem', color: 'var(--color-accent)', fontWeight: 500 }}>{t.acpTerritoryLabel}</span>
                  <button
                    onClick={() => saveBulkTerritory(true, false)}
                    disabled={bulkTerritorySaving}
                    style={{
                      padding: '0.3rem 0.75rem', borderRadius: 6,
                      background: bulkTerritorySaving ? 'var(--color-warning)' : 'var(--color-warning-bg)',
                      color: 'var(--color-warning)', border: '1px solid var(--color-warning)',
                      cursor: bulkTerritorySaving ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem', fontWeight: 600,
                    }}
                  >
                    {bulkTerritorySaving ? '…' : t.acpCapitalBadge}
                  </button>
                  <button
                    onClick={() => saveBulkTerritory(false, true)}
                    disabled={bulkTerritorySaving}
                    style={{
                      padding: '0.3rem 0.75rem', borderRadius: 6,
                      background: bulkTerritorySaving ? 'var(--color-success)' : 'var(--color-success-bg)',
                      color: 'var(--color-success)', border: '1px solid var(--color-success)',
                      cursor: bulkTerritorySaving ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem', fontWeight: 600,
                    }}
                  >
                    {bulkTerritorySaving ? '…' : t.acpCityBadge}
                  </button>
                  <button
                    onClick={() => saveBulkTerritory(false, false)}
                    disabled={bulkTerritorySaving}
                    style={{
                      padding: '0.3rem 0.75rem', borderRadius: 6,
                      background: bulkTerritorySaving ? 'var(--color-bg-3)' : 'var(--color-bg-3)',
                      color: 'var(--color-text-muted)', border: '1px solid var(--color-border)',
                      cursor: bulkTerritorySaving ? 'not-allowed' : 'pointer',
                      fontSize: '0.82rem', fontWeight: 600,
                    }}
                  >
                    {bulkTerritorySaving ? '…' : t.acpDistrictBadge}
                  </button>

                  <button
                    onClick={() => { setSelectedIds(new Set()); setBulkValue(''); }}
                    style={{ padding: '0.3rem 0.6rem', borderRadius: 6, background: 'var(--color-bg-3)', border: 'none', cursor: 'pointer', fontSize: '0.85rem', marginLeft: 'auto' }}
                  >
                    {t.goClear}
                  </button>
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-3)' }}>
                    <th style={{ padding: '0.6rem 0.75rem', width: 36, borderBottom: '1px solid var(--color-border)' }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer' }}
                        title={t.aopSelectAll}
                      />
                    </th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>{t.acpThDistrict}</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>{t.acpThTerritory}</th>
                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>{t.acpThServicePrice}</th>
                    <th style={{ padding: '0.6rem 0.75rem', width: 60, borderBottom: '1px solid var(--color-border)' }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredDistricts.map(d => {
                    const isChecked = selectedIds.has(d.id);
                    return (
                      <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border)', background: isChecked ? 'var(--color-accent-dim)' : undefined }}>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(d.id)} style={{ cursor: 'pointer' }} />
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{districtLabel(d)}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          {d.isCapitalTerritory ? (
                            <span style={{
                              display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: 99,
                              background: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1px solid var(--color-warning)',
                              fontSize: '0.78rem', fontWeight: 600,
                            }}>{t.acpCapitalBadge}</span>
                          ) : d.isCityTerritory ? (
                            <span style={{
                              display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: 99,
                              background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success)',
                              fontSize: '0.78rem', fontWeight: 600,
                            }}>{t.acpCityBadge}</span>
                          ) : (
                            <span style={{
                              display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: 99,
                              background: 'var(--color-bg-3)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)',
                              fontSize: '0.78rem', fontWeight: 600,
                            }}>{t.acpDistrictBadge}</span>
                          )}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          {editingId === d.id ? (
                            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input
                                type="number" value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                placeholder={t.acpNullPricePh}
                                style={{ width: 90, padding: '0.25rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
                              />
                              <button onClick={() => saveEdit(d.id)} disabled={saving}
                                style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                {t.save}
                              </button>
                              <button onClick={() => setEditingId(null)}
                                style={{ padding: '0.25rem 0.6rem', borderRadius: 6, background: 'var(--color-bg-3)', border: 'none', cursor: 'pointer' }}>
                                ✕
                              </button>
                            </span>
                          ) : (
                            <span>{d.companyServicePrice != null ? `₾${d.companyServicePrice}` : <em style={{ color: 'var(--color-text-subtle)' }}>{t.acpNotSet}</em>}</span>
                          )}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <span style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => setEditingDistrict(d)}
                              style={{ padding: '0.2rem 0.55rem', borderRadius: 6, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                              ✎ {t.edit}
                            </button>
                            <button
                              onClick={() => setDeletingDistrict(d)}
                              style={{ padding: '0.2rem 0.55rem', borderRadius: 6, background: 'var(--color-error-bg)', border: '1px solid var(--color-error)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-error)' }}
                                            >
                                              🗑 {t.delete}
                                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredDistricts.length === 0 && districts.length > 0 && (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)', padding: '0.6rem 0' }}>
                  {t.acpNoDistrictsMatch}
                </p>
              )}

              {/* deleted districts */}
              {showDeletedDistricts && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dashed var(--color-border)' }}>
                  <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-error)', letterSpacing: '0.05em' }}>
                    {t.acpDeletedDistrictsHeader}
                  </h3>
                  {loadingDeletedDistricts ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>Loading…</p>
                  ) : deletedDistricts.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>{t.acpNoDeletedDistricts}</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {deletedDistricts.map(d => (
                        <li key={d.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '0.5rem 0.6rem', marginBottom: 4,
                          background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 8,
                        }}>
                          <span style={{ flex: 1, color: 'var(--color-text-muted)', fontSize: '0.87rem', textDecoration: 'line-through' }}>
                            {districtLabel(d)}
                          </span>
                          {d.companyServicePrice != null && (
                            <span style={{ color: 'var(--color-text-subtle)', fontSize: '0.82rem' }}>₾{d.companyServicePrice}</span>
                          )}
                          <button
                            onClick={() => setRestoringDistrict(d)}
                            style={{
                              flexShrink: 0, padding: '0.25rem 0.6rem', borderRadius: 6,
                              background: 'var(--color-success-bg)', border: '1px solid var(--color-success)',
                              cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-success)', fontWeight: 600,
                            }}
                          >
                            ↩ {t.acpActivate}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
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

      {/* ── Delivery Schedule modal ─────────────────────────────────────────── */}
      {schedulingCity && (
        <EditDeliveryScheduleModal
          token={token}
          city={schedulingCity}
          onClose={() => setSchedulingCity(null)}
          onSaved={() => setSchedulingCity(null)}
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
          title={t.acpDeleteCityTitle}
          message={t.acpDeleteCityMsg(cityLabel(deletingCity))}
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
          title={t.acpDeleteDistrictTitle}
          message={t.acpDeleteDistrictMsg(districtLabel(deletingDistrict))}
          onClose={() => setDeletingDistrict(null)}
          onConfirm={async () => {
            await deleteDistrict(deletingDistrict.id, token);
            setDistricts(prev => prev.filter(d => d.id !== deletingDistrict.id));
            setDeletingDistrict(null);
          }}
        />
      )}

      {/* ── Confirm Activate City modal ───────────────────────────────────── */}
      {restoringCity && (
        <ConfirmActivateModal
          title={t.acpActivateCityTitle}
          message={t.acpActivateCityMsg(cityLabel(restoringCity))}
          conflictMessage={t.acpRestoreCityConflict}
          onClose={() => setRestoringCity(null)}
          onConfirm={() => confirmRestoreCity(restoringCity)}
        />
      )}

      {/* ── Confirm Activate District modal ───────────────────────────────── */}
      {restoringDistrict && (
        <ConfirmActivateModal
          title={t.acpActivateDistrictTitle}
          message={t.acpActivateDistrictMsg(districtLabel(restoringDistrict))}
          conflictMessage={t.acpRestoreDistrictConflict}
          onClose={() => setRestoringDistrict(null)}
          onConfirm={() => confirmRestoreDistrict(restoringDistrict)}
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
  const { t } = useLanguage();
  const [cityName, setCityName]       = useState('');
  const [cityNameGeo, setCityNameGeo] = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cityName.trim()) { setError(t.acpErrEnglishRequired); return; }
    setSubmitting(true);
    setError('');
    try {
      const city = await createCity(cityName.trim(), cityNameGeo.trim() || null, token);
      onCreated(city);
    } catch (err) {
      setError(err instanceof Error && err.message === 'CONFLICT'
        ? t.acpErrCityConflict(cityName)
        : t.acpErrCityFail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t.acpAddCityTitle} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label={t.acpEnglishName} required>
          <input ref={firstRef} style={INPUT} value={cityName} onChange={e => setCityName(e.target.value)} placeholder={t.acpCityNamePh} />
        </Field>
        <Field label={t.acpGeorgianName}>
          <input style={INPUT} value={cityNameGeo} onChange={e => setCityNameGeo(e.target.value)} placeholder={t.acpCityNameGeoPh} />
        </Field>
        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.87rem' }}>
            {t.cancel}
          </button>
          <button type="submit" disabled={submitting}
            style={{ padding: '0.4rem 1rem', borderRadius: 7, background: submitting ? 'var(--color-accent)' : 'var(--color-accent)', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
            {submitting ? t.submitting : t.acpCreateCityBtn}
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
  const { lang, t } = useLanguage();
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
    if (!districtName.trim()) { setError(t.acpErrEnglishRequired); return; }
    if (isCapitalTerritory && isCityTerritory) {
      setError(t.acpErrBothTerritory);
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
        ? t.acpErrDistrictConflict(districtName, cityDisplayName)
        : t.acpErrDistrictFail);
    } finally {
      setSubmitting(false);
    }
  }

  const CHECKBOX_ROW: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '0.45rem 0.65rem', borderRadius: 7,
    border: '1px solid var(--color-border)', fontSize: '0.88rem',
    cursor: 'pointer', userSelect: 'none',
  };

  return (
    <Modal title={t.acpAddDistrictTitle(cityDisplayName)} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label={t.acpEnglishName} required>
          <input ref={firstRef} style={INPUT} value={districtName} onChange={e => setDistrictName(e.target.value)} placeholder={t.acpDistrictNamePh} />
        </Field>
        <Field label={t.acpGeorgianName}>
          <input style={INPUT} value={districtNameGeo} onChange={e => setDistrictNameGeo(e.target.value)} placeholder={t.acpDistrictNameGeoPh} />
        </Field>
        <Field label={t.acpServicePriceLabel}>
          <input style={INPUT} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder={t.acpServicePricePh} />
        </Field>
        <Field label={t.acpPricingTerritory}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={CHECKBOX_ROW}>
              <input type="checkbox" checked={isCapitalTerritory}
                onChange={e => { setIsCapitalTerritory(e.target.checked); if (e.target.checked) setIsCityTerritory(false); }} />
              <span>{t.acpCapitalTerritory} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{t.acpCapitalTerritoryHint}</span></span>
            </label>
            <label style={CHECKBOX_ROW}>
              <input type="checkbox" checked={isCityTerritory}
                onChange={e => { setIsCityTerritory(e.target.checked); if (e.target.checked) setIsCapitalTerritory(false); }} />
              <span>{t.acpCityTerritory} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{t.acpCityTerritoryHint}</span></span>
            </label>
          </div>
        </Field>
        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.87rem' }}>
            {t.cancel}
          </button>
          <button type="submit" disabled={submitting}
            style={{ padding: '0.4rem 1rem', borderRadius: 7, background: submitting ? 'var(--color-accent)' : 'var(--color-accent)', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
            {submitting ? t.submitting : t.acpCreateDistrictBtn}
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
  const { t } = useLanguage();
  const [cityName, setCityName]       = useState(city.cityName);
  const [cityNameGeo, setCityNameGeo] = useState(city.cityNameGeo ?? '');
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cityName.trim()) { setError(t.acpErrEnglishRequired); return; }
    setSubmitting(true);
    setError('');
    try {
      await editCity(city.id, cityName.trim(), cityNameGeo.trim() || null, token);
      onSaved({ ...city, cityName: cityName.trim(), cityNameGeo: cityNameGeo.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error && err.message === 'CONFLICT'
        ? t.acpErrCityConflict(cityName)
        : t.acpErrCityUpdateFail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t.acpEditCityTitle} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label={t.acpEnglishName} required>
          <input ref={firstRef} style={INPUT} value={cityName} onChange={e => setCityName(e.target.value)} />
        </Field>
        <Field label={t.acpGeorgianName}>
          <input style={INPUT} value={cityNameGeo} onChange={e => setCityNameGeo(e.target.value)} />
        </Field>
        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.87rem' }}>
            {t.cancel}
          </button>
          <button type="submit" disabled={submitting}
            style={{ padding: '0.4rem 1rem', borderRadius: 7, background: submitting ? 'var(--color-accent)' : 'var(--color-accent)', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
            {submitting ? t.loading : t.awptSaveBtn}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit Delivery Schedule Modal ────────────────────────────────────────────────
type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const DAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function EditDeliveryScheduleModal({ token, city, onClose, onSaved }: {
  token: string;
  city: City;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const dayLabel: Record<DayKey, string> = {
    monday: t.dayMonday, tuesday: t.dayTuesday, wednesday: t.dayWednesday, thursday: t.dayThursday,
    friday: t.dayFriday, saturday: t.daySaturday, sunday: t.daySunday,
  };
  const [days, setDays] = useState<Record<DayKey, boolean>>({
    monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchCityDeliverySchedule(city.id)
      .then((schedule: DeliverySchedule) => {
        if (cancelled) return;
        setDays({
          monday: schedule.monday, tuesday: schedule.tuesday, wednesday: schedule.wednesday,
          thursday: schedule.thursday, friday: schedule.friday, saturday: schedule.saturday, sunday: schedule.sunday,
        });
      })
      .catch(() => { if (!cancelled) setError(t.acpScheduleErrLoad); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [city.id, t.acpScheduleErrLoad]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await setCityDeliverySchedule(city.id, days, token);
      onSaved();
    } catch {
      setError(t.acpScheduleErrFail);
    } finally {
      setSubmitting(false);
    }
  }

  const CHECKBOX_ROW: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '0.3rem 0', cursor: 'pointer', fontSize: '0.87rem',
  };

  return (
    <Modal title={t.acpScheduleTitle(city.cityName)} onClose={onClose}>
      {loading ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>{t.loading}</p>
      ) : (
        <form onSubmit={handleSubmit}>
          {DAY_KEYS.map(day => (
            <label key={day} style={CHECKBOX_ROW}>
              <input type="checkbox" checked={days[day]}
                onChange={e => setDays(prev => ({ ...prev, [day]: e.target.checked }))} />
              {dayLabel[day]}
            </label>
          ))}
          {error && <p style={{ color: 'var(--color-error)', fontSize: '0.82rem', margin: '0.75rem 0 0' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.87rem' }}>
              {t.cancel}
            </button>
            <button type="submit" disabled={submitting}
              style={{ padding: '0.4rem 1rem', borderRadius: 7, background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
              {submitting ? t.loading : t.awptSaveBtn}
            </button>
          </div>
        </form>
      )}
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
  const { t } = useLanguage();
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
    if (!districtName.trim()) { setError(t.acpErrEnglishRequired); return; }
    if (isCapitalTerritory && isCityTerritory) {
      setError(t.acpErrBothTerritory);
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
        ? t.acpErrDistrictConflictEdit(districtName)
        : t.acpErrDistrictUpdateFail);
    } finally {
      setSubmitting(false);
    }
  }

  const CHECKBOX_ROW: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '0.45rem 0.65rem', borderRadius: 7,
    border: '1px solid var(--color-border)', fontSize: '0.88rem',
    cursor: 'pointer', userSelect: 'none',
  };

  return (
    <Modal title={t.acpEditDistrictTitle} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label={t.acpEnglishName} required>
          <input ref={firstRef} style={INPUT} value={districtName} onChange={e => setDistrictName(e.target.value)} />
        </Field>
        <Field label={t.acpGeorgianName}>
          <input style={INPUT} value={districtNameGeo} onChange={e => setDistrictNameGeo(e.target.value)} />
        </Field>
        <Field label={t.acpServicePriceLabel}>
          <input style={INPUT} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder={t.acpServicePriceEditPh} />
        </Field>
        <Field label={t.acpPricingTerritory}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={CHECKBOX_ROW}>
              <input type="checkbox" checked={isCapitalTerritory}
                onChange={e => { setIsCapitalTerritory(e.target.checked); if (e.target.checked) setIsCityTerritory(false); }} />
              <span>{t.acpCapitalTerritory} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{t.acpCapitalTerritoryHint}</span></span>
            </label>
            <label style={CHECKBOX_ROW}>
              <input type="checkbox" checked={isCityTerritory}
                onChange={e => { setIsCityTerritory(e.target.checked); if (e.target.checked) setIsCapitalTerritory(false); }} />
              <span>{t.acpCityTerritory} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{t.acpCityTerritoryHint}</span></span>
            </label>
          </div>
        </Field>
        {error && <p style={{ color: 'var(--color-error)', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.87rem' }}>
            {t.cancel}
          </button>
          <button type="submit" disabled={submitting}
            style={{ padding: '0.4rem 1rem', borderRadius: 7, background: submitting ? 'var(--color-accent)' : 'var(--color-accent)', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
            {submitting ? t.loading : t.awptSaveBtn}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Confirm Delete Modal ──────────────────────────────────────────────────────
function ConfirmDeleteModal({ title, message, onClose, onConfirm }: {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState('');

  async function handleConfirm() {
    setDeleting(true);
    setError('');
    try {
      await onConfirm();
    } catch {
      setError(t.awptErrDelete);
      setDeleting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: 'var(--color-text)' }}>{message}</p>
      {error && <p style={{ color: 'var(--color-error)', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={deleting}
          style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.87rem' }}>
          {t.cancel}
        </button>
        <button onClick={handleConfirm} disabled={deleting}
          style={{ padding: '0.4rem 1rem', borderRadius: 7, background: deleting ? 'var(--color-error)' : 'var(--color-error)', color: '#fff', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
          {deleting ? t.awptDeleting : t.delete}
        </button>
      </div>
    </Modal>
  );
}

// ── Confirm Activate Modal ────────────────────────────────────────────────────
function ConfirmActivateModal({ title, message, conflictMessage, onClose, onConfirm }: {
  title: string;
  message: string;
  conflictMessage: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [working, setWorking] = useState(false);
  const [error, setError]     = useState('');

  async function handleConfirm() {
    setWorking(true);
    setError('');
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error && e.message === 'CONFLICT' ? conflictMessage : t.acpRestoreFailed);
      setWorking(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: 'var(--color-text)' }}>{message}</p>
      {error && <p style={{ color: 'var(--color-error)', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={working}
          style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.87rem' }}>
          {t.cancel}
        </button>
        <button onClick={handleConfirm} disabled={working}
          style={{ padding: '0.4rem 1rem', borderRadius: 7, background: working ? 'var(--color-success)' : 'var(--color-success)', color: '#fff', border: 'none', cursor: working ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
          {working ? t.acpActivating : t.acpActivate}
        </button>
      </div>
    </Modal>
  );
}