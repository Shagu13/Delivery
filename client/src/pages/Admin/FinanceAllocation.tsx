import type { Dispatch, SetStateAction } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { round2 } from '../../utils/orderFinanceOutstanding';
import { formatGeorgianDateTime } from '../../utils/georgianTime';
import type { OrderFinanceLine } from '../../api/orderFinance';

// Select-and-allocate building blocks shared by every admin "pay" screen: the customer
// settle card (AdminFinancePage) and the courier settlement modal (SettlementModal). Kept in
// their own module so both import the same implementation instead of drifting apart.

const gel = (n: number) => `₾${n.toFixed(2)}`;

export type Sel = Record<string, { checked: boolean; amount: string }>;
type SetSel = Dispatch<SetStateAction<Sel>>;

export interface FlowVM {
    payable: OrderFinanceLine[];
    owed: number;
    paid: number;
    selTotal: number;
    selCount: number;
    allChecked: boolean;
}

// Displayed amount for a row (defaults to its full outstanding until edited).
export const amountOf = (sel: Sel, o: OrderFinanceLine, out: (o: OrderFinanceLine) => number) =>
    sel[o.orderId]?.amount ?? out(o).toFixed(2);

export const buildFlow = (
    lines: OrderFinanceLine[], sel: Sel,
    out: (o: OrderFinanceLine) => number, paidOf: (o: OrderFinanceLine) => number,
): FlowVM => {
    const payable = lines.filter(o => out(o) > 0.005);
    const owed = round2(payable.reduce((s, o) => s + out(o), 0));
    const paid = round2(lines.reduce((s, o) => s + paidOf(o), 0));
    const checked = payable.filter(o => sel[o.orderId]?.checked);
    const selTotal = round2(checked.reduce((s, o) => s + (Number(amountOf(sel, o, out)) || 0), 0));
    const allChecked = payable.length > 0 && checked.length === payable.length;
    return { payable, owed, paid, selTotal, selCount: checked.length, allChecked };
};

export const toggle = (setSel: SetSel, id: string, outstanding: number) =>
    setSel(prev => { const c = prev[id]; return { ...prev, [id]: { checked: !c?.checked, amount: c?.amount ?? outstanding.toFixed(2) } }; });

// Editing a price also ticks the row so it's included in the payment.
export const setAmt = (setSel: SetSel, id: string, amount: string) =>
    setSel(prev => ({ ...prev, [id]: { checked: true, amount } }));

export const toggleAll = (setSel: SetSel, payable: OrderFinanceLine[], out: (o: OrderFinanceLine) => number, check: boolean) =>
    setSel(prev => {
        const next: Sel = { ...prev };
        for (const o of payable) next[o.orderId] = { checked: check, amount: prev[o.orderId]?.amount ?? out(o).toFixed(2) };
        return next;
    });

// One money flow's pay bar: select-all + selected total + Pay button.
// `netTotal`/`netFormula` (COD bar only) override the "Selected" figure so it reflects the
// cash actually handed over — selected COD minus selected service — with a breakdown.
export function FlowBar({ f, payLabel, busy, onPay, onToggleAll, borderRight, netTotal, netFormula }: {
    f: FlowVM; payLabel: string; busy: boolean;
    onPay: () => void; onToggleAll: (check: boolean) => void; borderRight?: boolean;
    netTotal?: number; netFormula?: string;
}) {
    const { t } = useLanguage();
    const settled = f.owed <= 0.005;
    return (
        <div style={{ padding: '12px 14px', borderRight: borderRight ? '1px solid var(--color-border)' : undefined, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--color-text-muted)', cursor: settled ? 'default' : 'pointer' }}>
                    <input type="checkbox" checked={f.allChecked} disabled={settled} onChange={e => onToggleAll(e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: 'var(--color-accent)', cursor: settled ? 'default' : 'pointer' }} />
                    {t.ofinSelectAll}
                </label>
                <button className="btn-primary" disabled={busy || f.selTotal <= 0.005} onClick={onPay}>{payLabel}</button>
            </div>
            <div style={{ fontSize: '0.72rem' }}>
                {settled
                    ? <span style={{ color: '#059669', fontWeight: 600 }}>{t.ofinAllSettled}</span>
                    : f.selCount > 0
                        ? <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
                            {t.ofinSelectedTotal(gel(netTotal ?? f.selTotal))}
                            {netFormula && <span style={{ color: 'var(--color-text-subtle)', fontWeight: 500, marginLeft: 6 }}>{netFormula}</span>}
                          </span>
                        : <span style={{ color: 'var(--color-text-subtle)' }}>{t.ofinSelectToAllocate}</span>}
            </div>
        </div>
    );
}

// One order's amount field for a single flow — checkbox + editable price, always available.
// `total` = full obligation, `paid` = amount settled so far (shown so an admin sees how much it
// was vs how much is paid, without an extra column).
export function AllocCell({ applicable, outstanding, checked, amount, onToggle, onAmount, paidAt, total, paid, warning, notApplicableLabel }: {
    applicable: boolean; outstanding: number; checked: boolean; amount: string;
    onToggle: () => void; onAmount: (v: string) => void; paidAt?: string | null;
    total?: number; paid?: number;
    /** Tooltip text for a warning badge shown next to the outstanding amount, e.g. when
     *  the courier hasn't yet remitted the cash this payout would be drawn from. */
    warning?: string;
    /** Text shown when `applicable` is false. Defaults to "recipient pays" (customer fee flow). */
    notApplicableLabel?: string;
}) {
    const { t } = useLanguage();
    if (!applicable)
        return <div style={{ minWidth: 160, textAlign: 'right' }}><span style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)' }}>{notApplicableLabel ?? t.ofinRecipientPays}</span></div>;
    if (outstanding <= 0.005)
        return (
            <div style={{ minWidth: 160, textAlign: 'right' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#059669' }}>{t.ofinPaid}</span>
                {/* how much is paid / how much it was */}
                {total != null && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                        {gel(paid ?? 0)} / {gel(total)}
                    </div>
                )}
                {paidAt && <div style={{ fontSize: '0.66rem', color: 'var(--color-text-subtle)', marginTop: 1 }}>{formatGeorgianDateTime(paidAt)}</div>}
            </div>
        );

    // Pending amount is red; if part of the obligation has already been paid (partly
    // paid) it turns purple to distinguish a partial from a fully-outstanding row.
    const partlyPaid = (paid ?? 0) > 0.005;
    const outColor = partlyPaid ? '#8b5cf6' : '#ef4444';
    return (
        <div style={{ minWidth: 160, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                <input type="checkbox" checked={checked} onChange={onToggle}
                    style={{ width: 15, height: 15, accentColor: 'var(--color-accent)', cursor: 'pointer', flexShrink: 0 }} />
                {warning && (
                    <span title={warning} style={{ fontSize: '0.82rem', color: '#f59e0b', cursor: 'help', flexShrink: 0 }}>⚠</span>
                )}
                {/* Actual amount owed (outstanding), always shown next to the editable field. */}
                <span title={t.ofinOutstandingCol} style={{ fontSize: '0.78rem', fontWeight: 700, color: outColor, whiteSpace: 'nowrap' }}>{gel(outstanding)}</span>
                <input type="number" min="0" step="0.01" max={outstanding}
                    value={amount}
                    onChange={e => onAmount(e.target.value)}
                    style={{ width: 80, textAlign: 'right', background: checked ? 'var(--color-bg-3)' : 'transparent', border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.8rem', padding: '3px 6px', outline: 'none' }} />
            </div>
            {/* how much is paid / how much it was — shown when something is partially paid */}
            {total != null && (paid ?? 0) > 0.005 && (
                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-subtle)' }}>{gel(paid ?? 0)} / {gel(total)}</span>
            )}
        </div>
    );
}
