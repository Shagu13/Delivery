// Shared date-window resolution for admin list pages (Pick-Up, Packages) that combine
// a day/range navigator with a free-text search, backed by a paginated server query.
//
// `selectedDate === null` is ambiguous on its own — it means both "the navigator hasn't
// been touched yet" and "the admin explicitly clicked Show All". `dateTouched` disambiguates:
// once true, whatever the navigator holds (including both null = Show All) is sent as-is.
import { georgianToday, toDateKey } from './georgianTime';

export interface DateWindowInput {
    /** True once the admin has interacted with the day/range navigator at all. */
    dateTouched: boolean;
    search: string;
    selectedDate: Date | null;
    rangeEnd: Date | null;
    /** True when some other filter (city/district/status/courier/…) is active. Like a
     *  search term, it releases the rolling-7-day cap so that filter reaches the whole DB
     *  instead of silently missing matches older than a week. Default false. */
    otherFiltersActive?: boolean;
}

export interface DateWindow {
    date?: string;
    dateTo?: string;
}

/**
 * - A search term or another filter is active → no date bound (reaches the whole DB),
 *   regardless of the navigator — a search should never be silently narrowed by a day/range
 *   picked before the admin started typing.
 * - Otherwise, navigator touched → send exactly what's chosen (both undefined = Show All → whole DB).
 * - Otherwise, not touched → rolling last-7-days window (inclusive of today).
 */
export function resolveDateWindow({ dateTouched, search, selectedDate, rangeEnd, otherFiltersActive = false }: DateWindowInput): DateWindow {
    if (search.trim() || otherFiltersActive) return {};

    if (dateTouched) {
        return {
            date:   selectedDate ? toDateKey(selectedDate) : undefined,
            dateTo: rangeEnd     ? toDateKey(rangeEnd)      : undefined,
        };
    }

    const to = georgianToday();
    const from = new Date(to);
    from.setDate(from.getDate() - 6);
    return { date: toDateKey(from), dateTo: toDateKey(to) };
}
