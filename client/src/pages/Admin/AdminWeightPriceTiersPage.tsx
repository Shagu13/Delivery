import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import {
  type WeightPriceTier,
  fetchWeightPriceTiers,
  createWeightPriceTier,
  updateWeightPriceTier,
  deleteWeightPriceTier,
  tierLabel,
} from '../../api/weightPriceTiers';

interface Props {
  token: string;
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, padding: '1.5rem',
        width: 480, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
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

// ── Field helper ──────────────────────────────────────────────────────────────
function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>{hint}</p>}
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.45rem 0.65rem', borderRadius: 7,
  border: '1px solid #d1d5db', fontSize: '0.88rem',
};

// ── Tier form (shared by Create / Edit) ───────────────────────────────────────
interface TierFormState {
  label:         string;
  minWeightKg:   string;
  maxWeightKg:   string;
  capitalPrice:  string;
  cityPrice:     string;
  districtPrice: string;
}

const EMPTY_FORM: TierFormState = {
  label: '', minWeightKg: '', maxWeightKg: '',
  capitalPrice: '', cityPrice: '', districtPrice: '',
};

function TierForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: TierFormState;
  submitting: boolean;
  error: string;
  onSubmit: (form: TierFormState) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<TierFormState>(initial ?? EMPTY_FORM);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  const set = (field: keyof TierFormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div>
      {/* Weight range */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={t.awptMinWeight} required>
          <input
            ref={firstRef}
            style={INPUT} type="number" min="0" step="0.1"
            value={form.minWeightKg}
            onChange={e => set('minWeightKg', e.target.value)}
            placeholder={t.awptMinWeightPh}
          />
        </Field>
        <Field label={t.awptMaxWeight} required>
          <input
            style={INPUT} type="number" min="0" step="0.1"
            value={form.maxWeightKg}
            onChange={e => set('maxWeightKg', e.target.value)}
            placeholder={t.awptMaxWeightPh}
          />
        </Field>
      </div>

      {/* Optional label */}
      <Field label={t.awptLabelField} hint={t.awptLabelHint}>
        <input
          style={INPUT}
          value={form.label}
          onChange={e => set('label', e.target.value)}
          placeholder={t.awptLabelPh}
          maxLength={100}
        />
      </Field>

      {/* Zone prices */}
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e7eb',
        borderRadius: 8, padding: '0.85rem 1rem', marginBottom: '0.9rem',
      }}>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
          {t.awptZonePricesLabel}
        </p>
        <p style={{ margin: '0 0 0.85rem', fontSize: '0.75rem', color: '#6b7280' }}>
          {t.awptZonePricesHint}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label={t.awptCapitalPrice}>
            <input
              style={INPUT} type="number" min="0.01" step="0.01"
              value={form.capitalPrice}
              onChange={e => set('capitalPrice', e.target.value)}
              placeholder="₾"
            />
          </Field>
          <Field label={t.awptCityPrice}>
            <input
              style={INPUT} type="number" min="0.01" step="0.01"
              value={form.cityPrice}
              onChange={e => set('cityPrice', e.target.value)}
              placeholder="₾"
            />
          </Field>
          <Field label={t.awptDistrictPrice}>
            <input
              style={INPUT} type="number" min="0.01" step="0.01"
              value={form.districtPrice}
              onChange={e => set('districtPrice', e.target.value)}
              placeholder="₾"
            />
          </Field>
        </div>
      </div>

      {error && (
        <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
        <button
          type="button" onClick={onCancel}
          style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#f3f4f6', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.87rem' }}
        >
          {t.cancel}
        </button>
        <button
          type="button"
          onClick={() => onSubmit(form)}
          disabled={submitting}
          style={{ padding: '0.4rem 1rem', borderRadius: 7, background: submitting ? '#d97706' : 'var(--color-accent, #c47f17)', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}
        >
          {submitting ? t.awptLoading : submitLabel}
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parsePriceField(val: string): number | null {
  const n = parseFloat(val);
  return isNaN(n) || n <= 0 ? null : n;
}

// ── Create Modal ──────────────────────────────────────────────────────────────
function CreateTierModal({ token, onClose, onCreated }: {
  token: string;
  onClose: () => void;
  onCreated: (tier: WeightPriceTier) => void;
}) {
  const { t } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  async function handleSubmit(form: TierFormState) {
    const min = parseFloat(form.minWeightKg);
    const max = parseFloat(form.maxWeightKg);
    if (isNaN(min) || isNaN(max)) { setError(t.awptErrWeightNumbers); return; }
    if (max <= min) { setError(t.awptErrMaxWeight); return; }
    setSubmitting(true);
    setError('');
    try {
      const tier = await createWeightPriceTier({
        label:         form.label.trim() || null,
        minWeightKg:   min,
        maxWeightKg:   max,
        capitalPrice:  parsePriceField(form.capitalPrice),
        cityPrice:     parsePriceField(form.cityPrice),
        districtPrice: parsePriceField(form.districtPrice),
      }, token);
      onCreated(tier);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.awptErrCreate);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t.awptAddModalTitle} onClose={onClose}>
      <TierForm
        submitting={submitting}
        error={error}
        onSubmit={handleSubmit}
        onCancel={onClose}
        submitLabel={t.awptCreateBtn}
      />
    </Modal>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditTierModal({ token, tier, onClose, onSaved }: {
  token: string;
  tier: WeightPriceTier;
  onClose: () => void;
  onSaved: (updated: WeightPriceTier) => void;
}) {
  const { t } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  const initial: TierFormState = {
    label:         tier.label ?? '',
    minWeightKg:   String(tier.minWeightKg),
    maxWeightKg:   String(tier.maxWeightKg),
    capitalPrice:  tier.capitalPrice  != null ? String(tier.capitalPrice)  : '',
    cityPrice:     tier.cityPrice     != null ? String(tier.cityPrice)     : '',
    districtPrice: tier.districtPrice != null ? String(tier.districtPrice) : '',
  };

  async function handleSubmit(form: TierFormState) {
    const min = parseFloat(form.minWeightKg);
    const max = parseFloat(form.maxWeightKg);
    if (isNaN(min) || isNaN(max)) { setError(t.awptErrWeightNumbers); return; }
    if (max <= min) { setError(t.awptErrMaxWeight); return; }
    setSubmitting(true);
    setError('');
    try {
      const updated = await updateWeightPriceTier({
        id:            tier.id,
        label:         form.label.trim() || null,
        minWeightKg:   min,
        maxWeightKg:   max,
        capitalPrice:  parsePriceField(form.capitalPrice),
        cityPrice:     parsePriceField(form.cityPrice),
        districtPrice: parsePriceField(form.districtPrice),
      }, token);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.awptErrUpdate);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t.awptEditModalTitle} onClose={onClose}>
      <TierForm
        initial={initial}
        submitting={submitting}
        error={error}
        onSubmit={handleSubmit}
        onCancel={onClose}
        submitLabel={t.awptSaveBtn}
      />
    </Modal>
  );
}

// ── Confirm Delete Modal ──────────────────────────────────────────────────────
function ConfirmDeleteModal({ tier, token, onClose, onDeleted }: {
  tier: WeightPriceTier;
  token: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState('');

  async function handleConfirm() {
    setDeleting(true);
    setError('');
    try {
      await deleteWeightPriceTier(tier.id, token);
      onDeleted(tier.id);
    } catch {
      setError(t.awptErrDelete);
      setDeleting(false);
    }
  }

  return (
    <Modal title={t.awptDeleteModalTitle} onClose={onClose}>
      <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: '#374151' }}>
        {t.awptDeleteMsg(tierLabel(tier))}
      </p>
      {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={deleting}
          style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#f3f4f6', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.87rem' }}>
          {t.cancel}
        </button>
        <button onClick={handleConfirm} disabled={deleting}
          style={{ padding: '0.4rem 1rem', borderRadius: 7, background: deleting ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
          {deleting ? t.awptDeleting : t.awptDeleteTierBtn}
        </button>
      </div>
    </Modal>
  );
}

// ── Price cell ────────────────────────────────────────────────────────────────
function PriceCell({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>—</span>;
  return <span style={{ color: 'var(--color-accent, #c47f17)', fontWeight: 600 }}>₾{value.toFixed(2)}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminWeightPriceTiersPage({ token }: Props) {
  const { t } = useLanguage();
  const [tiers,   setTiers]   = useState<WeightPriceTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editing,    setEditing]    = useState<WeightPriceTier | null>(null);
  const [deleting,   setDeleting]   = useState<WeightPriceTier | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWeightPriceTiers()
      .then(data => { if (!cancelled) setTiers(data); })
      .catch(() => { if (!cancelled) setError(t.awptLoadFail); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  return (
    <div style={{ padding: '0 0 2rem' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-subtle)' }}>
            {t.awptDesc}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.45rem 1rem', borderRadius: 8,
            background: 'var(--color-accent, #c47f17)', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t.awptAddBtn}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-subtle)' }}>
          <div className="go-spinner" style={{ margin: '0 auto 0.5rem' }} />
          {t.awptLoading}
        </div>
      ) : tiers.length === 0 ? (
        <div style={{
          padding: '3rem 2rem', textAlign: 'center', border: '2px dashed var(--color-border)',
          borderRadius: 12, color: 'var(--color-text-subtle)',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚖️</div>
          <p style={{ margin: 0, fontWeight: 600 }}>{t.awptEmptyTitle}</p>
          <p style={{ margin: '0.25rem 0 1rem', fontSize: '0.85rem' }}>{t.awptEmptyHint}</p>
          <button
            onClick={() => setShowCreate(true)}
            style={{ padding: '0.45rem 1.2rem', borderRadius: 8, background: 'var(--color-accent, #c47f17)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            {t.awptAddFirstBtn}
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse',
            fontSize: '0.875rem', background: 'var(--color-bg)',
            border: '1px solid var(--color-border)', borderRadius: 10,
            overflow: 'hidden',
          }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-2, #f9fafb)', borderBottom: '1px solid var(--color-border)' }}>
                {[t.awptThLabel, t.awptThRange, t.awptThCapital, t.awptThCity, t.awptThDistrict, t.awptThActions].map(h => (
                  <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 700, fontSize: '0.78rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, i) => (
                <tr key={tier.id} style={{ borderBottom: i < tiers.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--color-text)' }}>
                    {tier.label ?? <span style={{ color: 'var(--color-text-subtle)', fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'Courier New, monospace', fontWeight: 600 }}>
                    {tier.minWeightKg} – {tier.maxWeightKg} kg
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}><PriceCell value={tier.capitalPrice} /></td>
                  <td style={{ padding: '0.75rem 1rem' }}><PriceCell value={tier.cityPrice} /></td>
                  <td style={{ padding: '0.75rem 1rem' }}><PriceCell value={tier.districtPrice} /></td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setEditing(tier)}
                        style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--color-bg-3, #f3f4f6)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        {t.edit}
                      </button>
                      <button
                        onClick={() => setDeleting(tier)}
                        style={{ padding: '4px 12px', borderRadius: 6, background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        {t.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateTierModal
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={tier => {
            setTiers(prev => [...prev, tier].sort((a, b) => a.minWeightKg - b.minWeightKg));
            setShowCreate(false);
          }}
        />
      )}
      {editing && (
        <EditTierModal
          token={token}
          tier={editing}
          onClose={() => setEditing(null)}
          onSaved={updated => {
            setTiers(prev => prev.map(t => t.id === updated.id ? updated : t).sort((a, b) => a.minWeightKg - b.minWeightKg));
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDeleteModal
          token={token}
          tier={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={id => {
            setTiers(prev => prev.filter(t => t.id !== id));
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
