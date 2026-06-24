import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackParcel, type TrackOrderResult } from '../../services/tracking';
import { getStatusMeta } from '../../utils/statusMeta';
import { getTrackProgress, type TrackStageKey } from '../../utils/trackingStages';
import './livoHome.css';

// The coded homepage below is rendered only for the LivoExpress tenant (see
// HomeRoute / TenantOwnHomePage); other tenants fall back to the generic
// block-based TenantHomePage. Host check lives in ./livoHost.

const STAGE_LABEL_KA: Record<TrackStageKey, string> = {
  registered:     'რეგისტრირებული',
  pickedUp:       'აღებული',
  atWarehouse:    'საწყობში',
  outForDelivery: 'მიტანის პროცესში',
  delivered:      'ჩაბარდა',
  returnPickedUp: 'აღებული',
  returned:       'დაბრუნდა',
};

function fmt(iso: string): string {
  return new Intl.DateTimeFormat('ka-GE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * LivoExpress's hand-built storefront. Layout is fixed in code; brand name and logo
 * come from the tenant's branding (still editable by the co-admin), and the accent
 * color is applied via --color-accent (BrandingProvider on the public host, or the
 * preview wrapper for the logged-in co-admin). The parcel search reuses the shared
 * tracking service + status helpers.
 */
export function LivoHomePage({ brandName, logoUrl }: { brandName?: string; logoUrl?: string | null }) {
  const name = brandName?.trim() || 'LivoExpress';
  const logo = logoUrl?.trim() || null;

  const [trackingNumber, setTrackingNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<TrackOrderResult | null>(null);
  const [error,   setError]   = useState<'NOT_FOUND' | 'SERVER_ERROR' | null>(null);

  const isModalOpen = loading || result !== null || error !== null;

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    const tn = trackingNumber.trim();
    if (!tn) return;
    setLoading(true); setResult(null); setError(null);
    try {
      setResult(await trackParcel(tn));
    } catch (err: unknown) {
      setError(err instanceof Error && err.message === 'NOT_FOUND' ? 'NOT_FOUND' : 'SERVER_ERROR');
    } finally {
      setLoading(false);
    }
  }

  function closeModal() { setResult(null); setError(null); setLoading(false); }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isModalOpen]);

  return (
    <div className="livo">
      {/* ── Nav ── */}
      <header className="livo__nav">
        <Link to="/" className="livo__brand" aria-label={name}>
          {logo
            ? <img src={logo} alt={name} className="livo__brand-logo" />
            : <span className="livo__brand-text">{name}</span>}
        </Link>
        <Link to="/login" className="livo__account" title="შესვლა" aria-label="შესვლა">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.7" />
            <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </Link>
      </header>

      {/* ── Hero ── */}
      <section className="livo__hero">
        <h1 className="livo__title">{name}</h1>
        <p className="livo__subtitle">გვერდები მალე დაემატება</p>
        {logo && <img src={logo} alt={name} className="livo__hero-logo" />}
      </section>

      {/* ── Parcel tracking ── */}
      <section className="livo__track">
        <h2 className="livo__track-title">გზავნილის ძებნა</h2>
        <form className="livo__track-form" onSubmit={handleTrack}>
          <input
            className="livo__track-input"
            type="text"
            placeholder="ჩაწერეთ გზავნილის კოდი"
            value={trackingNumber}
            onChange={e => setTrackingNumber(e.target.value)}
          />
          <button type="submit" className="livo__track-btn" disabled={loading}>
            {loading ? 'იძებნება…' : 'ძებნა'}
          </button>
        </form>
      </section>

      {/* ── Result modal ── */}
      {isModalOpen && (
        <div className="livo__overlay" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="livo__modal" onClick={e => e.stopPropagation()}>
            <div className="livo__modal-head">
              <span className="livo__modal-tn">{trackingNumber.trim().toUpperCase()}</span>
              <button className="livo__modal-close" onClick={closeModal} aria-label="დახურვა">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {loading && <div className="livo__modal-state"><div className="livo__spinner" />იძებნება…</div>}

            {!loading && error === 'NOT_FOUND' && (
              <div className="livo__modal-state livo__modal-state--err">
                გზავნილი კოდით <strong>{trackingNumber.trim().toUpperCase()}</strong> ვერ მოიძებნა.
              </div>
            )}
            {!loading && error === 'SERVER_ERROR' && (
              <div className="livo__modal-state livo__modal-state--err">
                მოხდა შეცდომა. სცადეთ მოგვიანებით.
              </div>
            )}

            {!loading && result && <TrackResult result={result} />}
          </div>
        </div>
      )}
    </div>
  );
}

function TrackResult({ result }: { result: TrackOrderResult }) {
  const meta = getStatusMeta(result.status, 'ka');
  const { stageKeys, activeIndex, cancelled } = getTrackProgress(result.status);

  return (
    <div className="livo__result">
      <div className="livo__badge">{meta.short}</div>
      {meta.description && <p className="livo__badge-desc">{meta.description}</p>}

      {!cancelled && (
        <div className="livo__steps">
          {stageKeys.map((key, i) => {
            const state = i < activeIndex ? 'done' : i === activeIndex ? 'current' : 'todo';
            return (
              <div key={key} className={`livo__step livo__step--${state}`}>
                <span className="livo__step-dot" />
                <span className="livo__step-label">{STAGE_LABEL_KA[key]}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="livo__info">
        <div className="livo__info-row">
          <span className="livo__info-label">მიმღები</span>
          <span className="livo__info-value">{result.recipientName || '—'}</span>
        </div>
        <div className="livo__info-row">
          <span className="livo__info-label">დანიშნულება</span>
          <span className="livo__info-value">{result.recipientCity}, {result.recipientDistrict}</span>
        </div>
        <div className="livo__info-row">
          <span className="livo__info-label">რეგისტრაცია</span>
          <span className="livo__info-value">{fmt(result.createdAt)}</span>
        </div>
        {result.deliveredAt && (
          <div className="livo__info-row">
            <span className="livo__info-label">ჩაბარდა</span>
            <span className="livo__info-value">{fmt(result.deliveredAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
