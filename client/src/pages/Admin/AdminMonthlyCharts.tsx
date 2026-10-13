// Presentational charts for the Admin Overview monthly statistics. All data arrives
// pre-aggregated from AdminMonthlyStats; nothing here fetches or filters.
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    PieChart, Pie, Cell,
} from 'recharts';
import type { MonthlyStatusGroup } from '../../api/adminGroupOrders';
import { useLanguage } from '../../contexts/useLanguage';
import { MONTHLY_GROUPS, MONTHLY_GROUP_COLORS, monthlyGroupLabel } from './monthlyStatsGroups';
import './AdminMonthlyStats.css';

const TOOLTIP_STYLE = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8rem' };
const TICK = { fontSize: 11, fill: 'var(--color-text-subtle)' };

export interface RankedBar { name: string; value: number }

export function StatusPie({ totals, selected, onToggle }: {
    totals: Record<MonthlyStatusGroup, number>;
    selected: MonthlyStatusGroup | null;
    onToggle: (group: MonthlyStatusGroup) => void;
}) {
    const { t } = useLanguage();
    const data = MONTHLY_GROUPS
        .map(key => ({ key, name: monthlyGroupLabel(t, key), value: totals[key], color: MONTHLY_GROUP_COLORS[key] }))
        .filter(d => d.value > 0);

    return (
        <ResponsiveContainer width="100%" height={260}>
            <PieChart>
                <Pie
                    data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={90} innerRadius={45} paddingAngle={2}
                    onClick={(_entry, index) => onToggle(data[index].key)}
                    style={{ cursor: 'pointer' }}
                >
                    {data.map(d => (
                        <Cell key={d.key} fill={d.color} fillOpacity={selected && selected !== d.key ? 0.3 : 1} />
                    ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend
                    wrapperStyle={{ fontSize: '0.78rem', cursor: 'pointer' }}
                    onClick={e => {
                        const hit = data.find(d => d.name === e.value);
                        if (hit) onToggle(hit.key);
                    }}
                />
            </PieChart>
        </ResponsiveContainer>
    );
}

/** One stacked bar per calendar day; with a group selected only that group's bar is drawn. */
export function DailyBars({ rows, selected }: {
    rows: Record<string, number>[];
    selected: MonthlyStatusGroup | null;
}) {
    const { t } = useLanguage();
    const groups = selected ? [selected] : MONTHLY_GROUPS;
    return (
        <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" tick={TICK} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={TICK} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                {groups.map(g => (
                    <Bar key={g} dataKey={g} name={monthlyGroupLabel(t, g)} stackId="a" fill={MONTHLY_GROUP_COLORS[g]} />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}

/** Horizontal ranking (top cities / couriers). Falls back to a message when empty. */
export function RankedBars({ rows, color }: { rows: RankedBar[]; color: string }) {
    const { t } = useLanguage();
    if (rows.length === 0) return <div className="oms__nodata">{t.omNoData}</div>;
    return (
        <ResponsiveContainer width="100%" height={rows.length * 34 + 24}>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={TICK} />
                <YAxis
                    type="category" dataKey="name" width={96} tick={TICK}
                    tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="value" name={t.omColCount} fill={color} radius={[0, 3, 3, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
