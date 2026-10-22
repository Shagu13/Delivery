import type { Courier } from '../../../api/couriers';
import { useLanguage } from '../../../contexts/useLanguage';
import { MAX_RANGE_DAYS, shiftDateKey, type CompletedFilterState, type RangeProblem } from './completedUtils';
import './completed-couriers.css';

function Pill<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="ccp-pill" role="group">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`ccp-pill__btn${value === o.value ? ' ccp-pill__btn--active' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  filters: CompletedFilterState;
  onChange: (patch: Partial<CompletedFilterState>) => void;
  couriers: Courier[];
  todayKey: string;
  problem: RangeProblem;
  canExport: boolean;
  exporting: boolean;
  onExport: () => void;
}

export function CompletedFilters({ filters, onChange, couriers, todayKey, problem, canExport, exporting, onExport }: Props) {
  const { t } = useLanguage();
  const { dayKey, fromKey, toKey } = filters;

  return (
    <div className="content-card" style={{ marginBottom: 16 }}>
      <div className="ccp-filters">
        <Pill
          value={filters.leg}
          onChange={leg => onChange({ leg })}
          options={[
            { value: 'deliveries', label: t.ccpLegDelivery },
            { value: 'pickups', label: t.ccpLegPickup },
          ]}
        />

        <label className="ccp-label" htmlFor="ccp-courier">{t.ccpCourierLabel}</label>
        <select
          id="ccp-courier"
          className="ccp-field"
          value={filters.courierId}
          onChange={e => onChange({ courierId: e.target.value })}
        >
          <option value="">{t.ccpAllCouriers}</option>
          {couriers.map(c => (
            <option key={c.courierId} value={c.courierId}>
              {c.fullName}{c.isDeleted ? ` (${t.courierDeactivatedBadge})` : ''}
            </option>
          ))}
        </select>

        <Pill
          value={filters.dateKind}
          onChange={dateKind => onChange({ dateKind })}
          options={[
            { value: 'day', label: t.ccpDay },
            { value: 'range', label: t.ccpRange },
          ]}
        />

        {filters.dateKind === 'day' ? (
          <div className="ccp-dates">
            <button
              type="button" className="go-action-btn go-action-btn--ghost ccp-nav-btn"
              title={t.ccpPrevDay} aria-label={t.ccpPrevDay}
              onClick={() => onChange({ dayKey: shiftDateKey(dayKey, -1) })}
            >‹</button>
            <input
              type="date" className="ccp-field" value={dayKey} max={todayKey}
              onChange={e => onChange({ dayKey: e.target.value })}
            />
            <button
              type="button" className="go-action-btn go-action-btn--ghost ccp-nav-btn"
              title={t.ccpNextDay} aria-label={t.ccpNextDay}
              disabled={!dayKey || dayKey >= todayKey}
              onClick={() => onChange({ dayKey: shiftDateKey(dayKey, 1) })}
            >›</button>
          </div>
        ) : (
          <div className="ccp-dates">
            <label className="ccp-label" htmlFor="ccp-from">{t.ccpFrom}</label>
            <input
              id="ccp-from" type="date" className="ccp-field" value={fromKey} max={toKey || todayKey}
              onChange={e => onChange({ fromKey: e.target.value })}
            />
            <label className="ccp-label" htmlFor="ccp-to">{t.ccpTo}</label>
            <input
              id="ccp-to" type="date" className="ccp-field" value={toKey} min={fromKey} max={todayKey}
              onChange={e => onChange({ toKey: e.target.value })}
            />
          </div>
        )}

        <button
          type="button"
          className="go-action-btn ccp-export"
          disabled={!canExport || exporting}
          onClick={onExport}
        >
          {exporting ? t.ccpExporting : t.ccpExport}
        </button>
      </div>

      {problem === 'reversed' && <div className="ccp-problem" role="alert">{t.ccpRangeInvalid}</div>}
      {problem === 'tooLong' && <div className="ccp-problem" role="alert">{t.ccpRangeTooLong(MAX_RANGE_DAYS)}</div>}
    </div>
  );
}
