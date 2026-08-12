import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllDistrictsFlat, type AllDistrictEntry, type City } from '../../api/cities';
import { useLanguage } from '../../contexts/useLanguage';
import '../../styles/dashboard.css';

interface Props {
  /**
   * When set, an edit button is shown per city and this fires on click. Left unset
   * (Customer portal) the board is read-only. The caller owns the actual editor —
   * this component must never import admin-only UI, since it's also bundled into
   * the Customer portal's lazy-loaded chunk (see client/CLAUDE.md "no admin code
   * shipped to a customer").
   */
  onEditCity?: (city: City) => void;
}

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
const DAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

interface CityGroup {
  cityId: string;
  cityName: string;
  cityNameGeo?: string;
  scheduleSet: boolean;
  days: Record<DayKey, boolean>;
  districts: AllDistrictEntry[];
}

const norm = (s: string) => s.toLowerCase();
const matches = (q: string, en: string, geo?: string) => norm(en).includes(q) || (!!geo && norm(geo).includes(q));

// The `all-districts` endpoint is already ordered by city name then district name (see
// CitiesController.GetAllDistricts), so grouping by first-seen cityId preserves that order —
// no need to re-sort here.
function groupByCity(entries: AllDistrictEntry[]): CityGroup[] {
  const map = new Map<string, CityGroup>();
  for (const e of entries) {
    let group = map.get(e.cityId);
    if (!group) {
      group = {
        cityId: e.cityId, cityName: e.cityName, cityNameGeo: e.cityNameGeo,
        scheduleSet: e.scheduleSet,
        days: {
          monday: e.monday, tuesday: e.tuesday, wednesday: e.wednesday, thursday: e.thursday,
          friday: e.friday, saturday: e.saturday, sunday: e.sunday,
        },
        districts: [],
      };
      map.set(e.cityId, group);
    }
    group.districts.push(e);
  }
  return Array.from(map.values());
}

export function CityScheduleBoard({ onEditCity }: Props) {
  const { lang, t } = useLanguage();
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cities', 'allDistricts'],
    queryFn: fetchAllDistrictsFlat,
    staleTime: 5 * 60 * 1000,
  });

  const dayLabel: Record<DayKey, string> = {
    monday: t.dayMonday, tuesday: t.dayTuesday, wednesday: t.dayWednesday, thursday: t.dayThursday,
    friday: t.dayFriday, saturday: t.daySaturday, sunday: t.daySunday,
  };

  const label = (en: string, geo?: string) => (lang === 'ka' && geo) ? geo : en;

  const cityGroups = useMemo(() => groupByCity(data ?? []), [data]);

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;

  const visibleGroups = useMemo(() => {
    if (!searching) return cityGroups;
    return cityGroups
      .map(g => {
        const cityMatches = matches(query, g.cityName, g.cityNameGeo);
        const districts = cityMatches
          ? g.districts
          : g.districts.filter(d => matches(query, d.districtName, d.districtNameGeo));
        return { ...g, districts };
      })
      .filter(g => g.districts.length > 0);
  }, [cityGroups, searching, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Search */}
      <div style={{ position: 'relative' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="7" cy="7" r="5" stroke="var(--color-text-subtle)" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="var(--color-text-subtle)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.scheduleSearchPlaceholder}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '11px 38px 11px 40px',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
            background: 'var(--color-bg-2)', color: 'var(--color-text)',
            fontSize: '16px', fontFamily: 'var(--font-body)',
          }}
        />
        {searching && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label={t.custSearchClear}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'var(--color-border)', color: 'var(--color-text-subtle)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          {/* Self-contained spinner: .go-spinner's CSS only ships with AdminDashboard's own
              <style> tag, so it renders unstyled on the Customer portal — see client/CLAUDE.md
              §"Shared UI CSS must be co-located". */}
          <style>{'@keyframes scheduleSpin { to { transform: rotate(360deg); } }'}</style>
          <div style={{
            width: 18, height: 18, border: '2px solid var(--color-border)',
            borderTopColor: 'var(--color-accent)', borderRadius: '50%',
            animation: 'scheduleSpin 0.7s linear infinite',
          }} />
        </div>
      )}

      {!isLoading && isError && (
        <div className="content-card">
          <div className="empty-state">
            <span className="empty-state__text">{t.scheduleLoadError}</span>
          </div>
        </div>
      )}

      {!isLoading && !isError && cityGroups.length === 0 && (
        <div className="content-card">
          <div className="empty-state">
            <span className="empty-state__text">{t.scheduleEmpty}</span>
          </div>
        </div>
      )}

      {!isLoading && !isError && cityGroups.length > 0 && searching && visibleGroups.length === 0 && (
        <div className="content-card">
          <div className="empty-state">
            <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
              <circle cx="17" cy="17" r="12" stroke="currentColor" strokeWidth="1.5" />
              <path d="M26 26l9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="empty-state__text">{t.scheduleNoResults}</span>
          </div>
        </div>
      )}

      {visibleGroups.map(g => (
        <div key={g.cityId} className="content-card">
          <div className="content-card__header" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span className="content-card__title">{label(g.cityName, g.cityNameGeo)}</span>
            {onEditCity && (
              <button
                type="button"
                onClick={() => onEditCity({ id: g.cityId, cityName: g.cityName, cityNameGeo: g.cityNameGeo })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  minHeight: 36, padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)', background: 'var(--color-bg-2)',
                  color: 'var(--color-text)', fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                }}
              >
                🗓 {t.acpScheduleBtn}
              </button>
            )}
          </div>
          <div className="content-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {g.scheduleSet ? DAY_KEYS.map(day => (
                <span
                  key={day}
                  title={dayLabel[day]}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 40, minHeight: 34, padding: '0 8px', borderRadius: 'var(--radius-sm)',
                    fontSize: '0.72rem', fontWeight: 700,
                    background: g.days[day] ? 'var(--color-accent-dim)' : 'var(--color-bg-3)',
                    color: g.days[day] ? 'var(--color-accent)' : 'var(--color-text-subtle)',
                    border: `1px solid ${g.days[day] ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  }}
                >
                  {dayLabel[day].slice(0, 3)}
                </span>
              )) : (
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)' }}>{t.calcDeliveryNotSet}</span>
              )}
            </div>

            <div>
              <div style={{
                fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'var(--color-text-subtle)', marginBottom: 6,
              }}>
                {t.scheduleDistrictsLabel} ({g.districts.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.districts.map(d => (
                  <span
                    key={d.districtId}
                    style={{
                      padding: '4px 10px', borderRadius: 100, background: 'var(--color-bg-3)',
                      fontSize: '0.78rem', color: 'var(--color-text)',
                    }}
                  >
                    {label(d.districtName, d.districtNameGeo)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
