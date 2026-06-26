import { useLanguage } from '../../contexts/useLanguage';
import { georgianToday, toDateKey } from '../../utils/georgianTime';

interface DateRangeNavProps {
  /** Range start (also the single-day value when `to` is null). Null = "All days". */
  from: Date | null;
  /** Range end (inclusive). Null = single day (`from`) or, with `from` null, "All days". */
  to: Date | null;
  onChange: (from: Date | null, to: Date | null) => void;
  /** Existing per-page CSS class prefix so the control inherits each page's styling
   *  (e.g. 'aop-daynav' on the Delivery page, 'pickup-daynav' on the Pick-Up pages). */
  classPrefix: string;
}

/**
 * Shared day/range navigator: All ↔ a single Georgian day (stepped with the arrows) ↔
 * an inclusive custom range (pick a "to" date). Used by the Delivery and Pick-Up pages.
 * Range is inclusive of both ends — 24→26 means the 24th, 25th and 26th.
 */
export function DateRangeNav({ from, to, onChange, classPrefix: p }: DateRangeNavProps) {
  const { t } = useLanguage();
  const todayKey = toDateKey(georgianToday());
  const fromKey  = from ? toDateKey(from) : '';
  const isSingleToday = from != null && to == null && fromKey === todayKey;

  const parse = (v: string): Date | null => (v ? new Date(v + 'T00:00:00') : null);

  // Arrows step a single day — a range collapses back to that one day.
  const step = (delta: number) => {
    const base = from ? new Date(from) : georgianToday();
    base.setDate(base.getDate() + delta);
    base.setHours(0, 0, 0, 0);
    onChange(base, null);
  };

  return (
    <div className={p}>
      <button
        className={`${p}__arrow`} disabled={!from}
        onClick={() => step(-1)} aria-label={t.pickupPrevDay} title={t.pickupPrevDay}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      <div className={`${p}__label`}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M4 1v2M10 1v2M1 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <input
          type="date"
          className={`${p}__date`}
          value={fromKey}
          max={todayKey}
          title={t.aopDateRangeFrom}
          onChange={e => {
            const nf = parse(e.target.value);
            if (!nf) { onChange(null, null); return; }   // clearing "from" → All
            onChange(nf, to && to >= nf ? to : null);     // drop "to" if it now precedes "from"
          }}
        />
        <span aria-hidden style={{ color: 'var(--color-text-subtle)', fontSize: '0.82rem' }}>→</span>
        <input
          type="date"
          className={`${p}__date`}
          value={to ? toDateKey(to) : ''}
          min={fromKey || undefined}
          max={todayKey}
          disabled={!from}
          title={t.aopDateRangeTo}
          onChange={e => {
            const nt = parse(e.target.value);
            onChange(from, nt && from && nt >= from ? nt : null);
          }}
        />
        {!from
          ? <span className={`${p}__today`}>{t.aopAllDays}</span>
          : isSingleToday && <span className={`${p}__today`}>{t.pickupToday}</span>}
      </div>

      <button
        className={`${p}__arrow`} disabled={!from || isSingleToday}
        onClick={() => step(1)} aria-label={t.pickupNextDay} title={t.pickupNextDay}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {from
        ? <button className={`${p}__jump`} onClick={() => onChange(null, null)}>{t.aopShowAll}</button>
        : <button className={`${p}__jump`} onClick={() => onChange(georgianToday(), null)}>{t.pickupToday}</button>}
    </div>
  );
}
