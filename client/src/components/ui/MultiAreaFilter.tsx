import { useState } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { usePlaceLocalizer } from '../../utils/usePlaceLocalizer';
import { CityDistrictPicker } from './CityDistrictPicker';

// One recipient-location filter entry. A city-only entry (district undefined) matches every
// district in that city; a city+district entry matches only that district. Several entries
// stack so an admin can filter by any number of cities and/or districts at once.
export interface AreaFilter {
    city: string;
    district?: string;
}

// A stored order location matches the filter set when the set is empty (no narrowing) or it
// matches ANY selected entry. City/district on orders are plain strings, compared by name.
export function matchesAreaFilter(
    areas: AreaFilter[],
    city: string | null | undefined,
    district: string | null | undefined,
): boolean {
    if (areas.length === 0) return true;
    const c = city ?? '';
    const d = district ?? '';
    return areas.some(a => a.city === c && (!a.district || a.district === d));
}

// Stable string key for the current selection — for React keys and effect/deps identity.
export const areaFilterKey = (areas: AreaFilter[]) =>
    areas.map(a => `${a.city}>${a.district ?? ''}`).join('|');

// Multi-select recipient-area filter: the shared single-select CityDistrictPicker stays the
// input (so its cascading city→district behaviour is untouched); "Add area" appends the current
// pick as a removable chip. Reused across the finance page's Overview and Payments filters.
export function MultiAreaFilter({ value, onChange }: {
    value: AreaFilter[];
    onChange: (next: AreaFilter[]) => void;
}) {
    const { t } = useLanguage();
    const { locCity, locDistrict } = usePlaceLocalizer();
    const [city, setCity] = useState('');
    const [district, setDistrict] = useState('');

    const add = () => {
        if (!city) return;
        const dist = district || undefined;
        const dup = value.some(a => a.city === city && (a.district ?? '') === (dist ?? ''));
        if (!dup) onChange([...value, { city, district: dist }]);
        setCity(''); setDistrict('');
    };

    const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 360px', minWidth: 240, maxWidth: 480 }}>
                    <CityDistrictPicker
                        cityValue={city}
                        districtValue={district}
                        onCityChange={c => { setCity(c); setDistrict(''); }}
                        onDistrictChange={setDistrict}
                    />
                </div>
                <button
                    type="button"
                    className="btn-primary"
                    disabled={!city}
                    onClick={add}
                    style={{ opacity: city ? 1 : 0.5, cursor: city ? 'pointer' : 'not-allowed' }}
                >
                    {t.finAreaAdd}
                </button>
            </div>
            {value.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {value.map((a, i) => (
                        <span
                            key={`${a.city}>${a.district ?? ''}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px', background: 'var(--color-accent-dim)', color: 'var(--color-accent)', borderRadius: 100, fontSize: '0.76rem', fontWeight: 700 }}
                        >
                            {locCity(a.city)}{a.district ? ` · ${locDistrict(a.district)}` : ''}
                            <button
                                type="button"
                                onClick={() => removeAt(i)}
                                title={t.finAreaRemove}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', fontSize: '0.95rem', lineHeight: 1 }}
                            >×</button>
                        </span>
                    ))}
                    <button
                        type="button"
                        onClick={() => onChange([])}
                        title={t.finAreaClearAll}
                        style={{ background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 100, color: 'var(--color-text-muted)', fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', cursor: 'pointer' }}
                    >
                        {t.finAreaClearAll}
                    </button>
                </div>
            )}
        </div>
    );
}
