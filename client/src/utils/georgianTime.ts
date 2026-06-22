// Georgian-time helpers for the admin UI.
//
// The backend stores timestamps as Georgian wall-clock (UTC+4) via Domain.CustomTime,
// serialized WITHOUT an offset (e.g. "2026-06-20T14:30:00"). Older rows may still be
// UTC with a trailing "Z". These helpers let the UI reason about the Georgian calendar
// day regardless of the browser's own timezone.

const TZ = 'Asia/Tbilisi';

/** A Date whose local fields (year/month/day/hour…) equal the current Georgian wall clock. */
export function georgianNow(): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0');
    return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/** Today's date (00:00) in Georgian time. */
export function georgianToday(): Date {
    const d = georgianNow();
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Local YYYY-MM-DD of a Date (matches what the backend's date query expects). */
export function toDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * The Georgian calendar day (YYYY-MM-DD) a backend timestamp falls on.
 * New rows have no offset → already Georgian wall-clock, read the literal date.
 * Legacy rows ending in Z / ±hh:mm → convert the instant into Georgian time first.
 */
export function georgianDateKeyOf(iso: string): string {
    const hasOffset = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso);
    if (!hasOffset) return iso.slice(0, 10);

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(iso));
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '01';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Display a backend timestamp as Georgian wall-clock "DD.MM.YYYY HH:MM".
 * New rows have no offset → read the literal parts; legacy Z/±offset rows are
 * converted into Georgian time first. Empty/undefined → "".
 */
export function formatGeorgianDateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const hasOffset = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso);
    if (!hasOffset) {
        const [date, time = ''] = iso.split('T');
        const [y, mo, d] = date.split('-');
        const [h = '00', mi = '00'] = time.split(':');
        return `${d}.${mo}.${y} ${h}:${mi}`;
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso));
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}
