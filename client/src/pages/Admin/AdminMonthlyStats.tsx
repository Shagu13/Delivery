// Admin Overview: statistics of the orders created in one chosen month.
// Clicking a pie slice (or a card) filters the daily / city / courier charts and the status
// list to that outcome group; the filtering is local — the endpoint returns everything
// pre-split by group.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetchAdminMonthlyStats } from '../../api/adminGroupOrders';
import type { MonthlyOrderType, MonthlyStatusGroup } from '../../api/adminGroupOrders';
import { useLanguage } from '../../contexts/useLanguage';
import { useOrdersChangedSignal } from '../../realtime/useOrdersChangedSignal';
import { isQueryFreshLive } from '../../utils/queryFreshness';
import { georgianToday } from '../../utils/georgianTime';
import { getStatusMeta } from '../../utils/statusMeta';
import { DailyBars, RankedBars, StatusPie } from './AdminMonthlyCharts';
import type { RankedBar } from './AdminMonthlyCharts';
import { MONTHLY_GROUPS, MONTHLY_GROUP_COLORS, monthlyGroupLabel } from './monthlyStatsGroups';
import './AdminMonthlyStats.css';

const TOP_N = 10;
const QUERY_PREFIX = ['admin', 'overviewMonthly'] as const;
const ORDER_TYPES: readonly MonthlyOrderType[] = ['Send', 'Return', 'Exchange'];

function sumBy<T>(rows: T[], keyOf: (r: T) => string, countOf: (r: T) => number): Map<string, number> {
    const out = new Map<string, number>();
    for (const r of rows) out.set(keyOf(r), (out.get(keyOf(r)) ?? 0) + countOf(r));
    return out;
}

function topN(totals: Map<string, number>): RankedBar[] {
    return [...totals.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, TOP_N);
}

export function AdminMonthlyStats({ token }: { token: string }) {
    const { t, lang } = useLanguage();
    const queryClient = useQueryClient();

    const today = georgianToday();
    const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
    const [type, setType] = useState<MonthlyOrderType | null>(null);
    const [group, setGroup] = useState<MonthlyStatusGroup | null>(null);

    const isCurrentMonth = ym.year === today.getFullYear() && ym.month === today.getMonth() + 1;
    const queryKey = [...QUERY_PREFIX, ym.year, ym.month, type ?? 'all'] as const;

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey,
        queryFn: () => fetchAdminMonthlyStats(token, ym.year, ym.month, type ?? undefined),
        enabled: !!token,
        placeholderData: keepPreviousData,
    });

    // Same self-echo guard as the rest of the Overview: skip a ping that lands right after
    // this month's own fetch.
    useOrdersChangedSignal(token || null, 'adminOrdersChanged', () => {
        if (isQueryFreshLive(queryClient, queryKey)) return;
        void queryClient.invalidateQueries({ queryKey: QUERY_PREFIX });
    });

    const shiftMonth = (delta: number) => {
        const d = new Date(ym.year, ym.month - 1 + delta, 1);
        setYm({ year: d.getFullYear(), month: d.getMonth() + 1 });
    };

    const derived = useMemo(() => {
        if (!data) return null;
        const totals = Object.fromEntries(MONTHLY_GROUPS.map(g => [g, 0])) as Record<MonthlyStatusGroup, number>;
        for (const s of data.statuses) totals[s.group] += s.count;

        const inScope = (g: MonthlyStatusGroup) => group === null || g === group;

        const daysInMonth = new Date(data.year, data.month, 0).getDate();
        const dayRows: Record<string, number>[] = Array.from({ length: daysInMonth }, (_, i) => ({
            day: i + 1, ...Object.fromEntries(MONTHLY_GROUPS.map(g => [g, 0])),
        }));
        for (const d of data.days) dayRows[d.day - 1][d.group] += d.count;

        const cities = topN(sumBy(data.cities.filter(c => inScope(c.group)), c => c.city, c => c.count));

        // The courier chart is about deliveries: Delivered until a slice says otherwise.
        const courierGroup = group ?? 'Delivered';
        const couriers = topN(sumBy(
            data.couriers.filter(c => c.group === courierGroup),
            c => c.courierName || c.courierId, c => c.count));

        const statuses = data.statuses.filter(s => inScope(s.group));
        return { totals, dayRows, cities, couriers, courierGroup, statuses, scopeTotal: statuses.reduce((n, s) => n + s.count, 0) };
    }, [data, group]);

    const toggleGroup = (g: MonthlyStatusGroup) => setGroup(cur => (cur === g ? null : g));
    const monthLabel = `${t.finMonths[ym.month - 1]} ${ym.year}`;

    return (
        <section className="oms">
            <div className="oms__controls">
                <div className="oms__month">
                    <button type="button" className="oms__nav" aria-label={t.omPrevMonth} onClick={() => shiftMonth(-1)}>‹</button>
                    <span className="oms__month-label">{monthLabel}</span>
                    <button type="button" className="oms__nav" aria-label={t.omNextMonth} disabled={isCurrentMonth} onClick={() => shiftMonth(1)}>›</button>
                </div>
                <div className="oms__types" role="group">
                    {([null, ...ORDER_TYPES] as (MonthlyOrderType | null)[]).map(o => (
                        <button
                            key={o ?? 'all'} type="button"
                            className={`oms__chip ${type === o ? 'oms__chip--active' : ''}`}
                            onClick={() => setType(o)}
                        >
                            {o === null ? t.omTypeAll : o === 'Send' ? t.aopOrderTypeSend : o === 'Return' ? t.aopOrderTypeReturn : t.aopOrderTypeExchange}
                        </button>
                    ))}
                </div>
            </div>

            {isError && !data ? (
                <div className="oms__message">
                    {t.omLoadFailed} <button type="button" className="oms__chip" onClick={() => void refetch()}>{t.omRetry}</button>
                </div>
            ) : isLoading || !data || !derived ? (
                <div className="oms__message">…</div>
            ) : data.total === 0 ? (
                <div className="oms__message">{t.omEmpty}</div>
            ) : (
                <>
                    <div className="stat-grid">
                        <div className="stat-card">
                            <div className="stat-card__label">{t.omTotal}</div>
                            <div className="stat-card__value">{data.total}</div>
                            <div className="stat-card__sub">{monthLabel}</div>
                        </div>
                        {MONTHLY_GROUPS.map(g => (
                            <button
                                key={g} type="button"
                                className={`stat-card oms__card ${group === g ? 'oms__card--active' : ''}`}
                                style={{ borderTop: `3px solid ${MONTHLY_GROUP_COLORS[g]}` }}
                                onClick={() => toggleGroup(g)}
                            >
                                <div className="stat-card__label">{monthlyGroupLabel(t, g)}</div>
                                <div className="stat-card__value">{derived.totals[g]}</div>
                            </button>
                        ))}
                    </div>

                    <div className="oms__grid">
                        <div className="content-card oms__panel">
                            <div className="content-card__header">
                                <span className="content-card__title">{t.omStatusTitle}</span>
                                {group && (
                                    <button type="button" className="oms__chip" onClick={() => setGroup(null)}>
                                        {monthlyGroupLabel(t, group)} ✕ {t.omClearFilter}
                                    </button>
                                )}
                            </div>
                            <div className="oms__panel-body">
                                <StatusPie totals={derived.totals} selected={group} onToggle={toggleGroup} />
                                <div className="oms__hint">{t.omStatusHint}</div>
                            </div>
                        </div>

                        <div className="content-card oms__panel">
                            <div className="content-card__header"><span className="content-card__title">{t.omDetailTitle}</span></div>
                            <div className="table-scroll">
                                <table className="courier-table">
                                    <thead>
                                        <tr><th>{t.omColStatus}</th><th>{t.omColCount}</th><th>{t.omColShare}</th></tr>
                                    </thead>
                                    <tbody>
                                        {derived.statuses.map(s => (
                                            <tr key={s.status}>
                                                <td>
                                                    <span className="oms__dot" style={{ background: MONTHLY_GROUP_COLORS[s.group] }} />
                                                    {getStatusMeta(s.status, lang).short}
                                                </td>
                                                <td>{s.count}</td>
                                                <td>{Math.round((s.count / data.total) * 100)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="content-card oms__panel">
                        <div className="content-card__header"><span className="content-card__title">{t.omDailyTitle}</span></div>
                        <div className="oms__panel-body"><DailyBars rows={derived.dayRows} selected={group} /></div>
                    </div>

                    <div className="oms__grid">
                        <div className="content-card oms__panel">
                            <div className="content-card__header"><span className="content-card__title">{t.omCityTitle}</span></div>
                            <div className="oms__panel-body">
                                <RankedBars rows={derived.cities} color={group ? MONTHLY_GROUP_COLORS[group] : 'var(--color-accent)'} />
                            </div>
                        </div>
                        <div className="content-card oms__panel">
                            <div className="content-card__header">
                                <span className="content-card__title">{t.omCourierTitle(monthlyGroupLabel(t, derived.courierGroup))}</span>
                            </div>
                            <div className="oms__panel-body">
                                <RankedBars rows={derived.couriers} color={MONTHLY_GROUP_COLORS[derived.courierGroup]} />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}
