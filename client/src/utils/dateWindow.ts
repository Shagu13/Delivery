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
}

export interface DateWindow {
    date?: string;
    dateTo?: string;
}

/**
 * - Navigator touched → send exactly what's chosen (both undefined = Show All → whole DB).
 * - Not touched, but a search term is present → no date bound (search reaches the whole DB).
 * - Not touched, no search → rolling last-7-days window (inclusive of today).
 */
export function resolveDateWindow({ dateTouched, search, selectedDate, rangeEnd }: DateWindowInput): DateWindow {
    if (dateTouched) {
        return {
            date:   selectedDate ? toDateKey(selectedDate) : undefined,
            dateTo: rangeEnd     ? toDateKey(rangeEnd)      : undefined,
        };
    }
    if (search.trim()) return {};

    const to = georgianToday();
    const from = new Date(to);
    from.setDate(from.getDate() - 6);
    return { date: toDateKey(from), dateTo: toDateKey(to) };
}
