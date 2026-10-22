import { useMemo, useState, type ReactNode } from 'react';
import { FormField } from '../../components/ui/FormField';
import { setCourierSalaryBulk } from '../../api/orders';
import type { CourierDayDelivery } from '../../api/couriers';
import { useLanguage } from '../../contexts/useLanguage';
import '../../components/ui/Modal.css';
import './EditCourierSalaryModal.css';

interface Props {
  courierName: string;
  orders: CourierDayDelivery[];
  token: string;
  canSeeRevenue: boolean;
  renderStatus: (status: string) => ReactNode;
  onClose: () => void;
  onSaved: (updated: number) => void;
}

const money = (n: number) => `₾${n.toFixed(2)}`;

/**
 * Couriers → Edit salary. One salary for the courier's orders of the selected day: ticked orders only, or — with nothing
 * ticked — every order listed. A salary above an order's service fee blocks Apply (the server enforces it too).
 * Mount it only while open so the form state resets.
 */
export function EditCourierSalaryModal({ courierName, orders, token, canSeeRevenue, renderStatus, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const [salaryText, setSalaryText] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const salary = salaryText.trim() === '' ? null : Number(salaryText);
  const salaryValid = salary !== null && Number.isFinite(salary) && salary >= 0;

  const targets = useMemo(
    () => (checked.size > 0 ? orders.filter(o => checked.has(o.id)) : orders),
    [orders, checked],
  );
  const targetIds = useMemo(() => new Set(targets.map(o => o.id)), [targets]);
  const overFee = (o: CourierDayDelivery) => salaryValid && targetIds.has(o.id) && o.companyServicePrice < salary;
  const overFeeCount = salaryValid ? targets.filter(o => o.companyServicePrice < salary).length : 0;
  const paidCutCount = salaryValid ? targets.filter(o => (o.courierSalaryPaidAmount ?? 0) > salary).length : 0;

  const canApply = salaryValid && !saving && targets.length > 0 && overFeeCount === 0;
  const allChecked = orders.length > 0 && checked.size === orders.length;

  const toggle = (id: string) => {
    setConfirmAll(false);
    setChecked(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  const toggleAll = () => { setConfirmAll(false); setChecked(allChecked ? new Set() : new Set(orders.map(o => o.id))); };

  async function submit() {
    if (!salaryValid) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await setCourierSalaryBulk(token, targets.map(o => o.id), salary);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.ecsSaveFail);
      setSaving(false);
      setConfirmAll(false);
    }
  }

  // Nothing ticked = every order gets overwritten, so ask once before doing it.
  const handleApply = () => {
    if (checked.size === 0 && !confirmAll) { setConfirmAll(true); return; }
    void submit();
  };

  return (
    <div className="ui-modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="ui-modal ecs-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{t.ecsTitle(courierName)}</span>
          <button className="ui-modal__close" onClick={onClose} disabled={saving} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ui-modal__body">
          <p className="ui-modal__message">{t.ecsIntro}</p>

          <FormField label={t.ecsSalaryLabel} type="number" min={0} step="0.01" inputMode="decimal" autoFocus
            value={salaryText} onChange={e => { setSalaryText(e.target.value); setConfirmAll(false); }} />

          {orders.length === 0 ? (
            <p className="ecs-scope">{t.ecsNoOrders}</p>
          ) : (
            <>
              <div className="ecs-toolbar">
                <label className="ecs-selectall">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  {t.ecsSelectAll}
                </label>
                <span className="ecs-scope">
                  {checked.size > 0 ? t.ecsScopeSelected(checked.size, orders.length) : t.ecsScopeAll(orders.length)}
                </span>
              </div>

              <div className="ecs-tablewrap">
                <table className="ecs-table">
                  <thead>
                    <tr>
                      <th />
                      <th>{t.aopThTracking}</th>
                      <th>{t.aopThStatus}</th>
                      <th className="ecs-num">{t.crwThSvcPrice}</th>
                      <th className="ecs-num">{t.crwThCourierSalary}</th>
                      {canSeeRevenue && <th className="ecs-num">{t.aopThRevenue}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => {
                      const bad = overFee(o);
                      const hit = salaryValid && targetIds.has(o.id);
                      return (
                        <tr key={o.id} className={bad ? 'ecs-row--bad' : undefined}>
                          <td><input type="checkbox" checked={checked.has(o.id)} onChange={() => toggle(o.id)} /></td>
                          <td><span className="tn-badge">{o.trackingNumber}</span></td>
                          <td>{renderStatus(o.status)}</td>
                          <td className="ecs-num">{money(o.companyServicePrice)}</td>
                          <td className="ecs-num">
                            {o.courierSalary != null ? money(o.courierSalary) : '—'}
                            {hit && <span className="ecs-arrow"> → {money(salary)}</span>}
                            {(o.courierSalaryPaidAmount ?? 0) > 0 && <span className="ecs-paid"> {t.ecsPaidBadge}</span>}
                          </td>
                          {canSeeRevenue && (
                            <td className="ecs-num">
                              {hit
                                ? <span className={bad ? 'ecs-neg' : undefined}>{money(o.companyServicePrice - salary)}</span>
                                : (o.companyRevenue != null ? money(o.companyRevenue) : '—')}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {overFeeCount > 0 && <div className="ui-modal__error" role="alert">{t.ecsOverFee(overFeeCount)}</div>}
          {overFeeCount === 0 && paidCutCount > 0 && <div className="ecs-warning" role="alert">{t.ecsPaidWarning(paidCutCount)}</div>}
          {error && <div className="ui-modal__error" role="alert">{error}</div>}
          {confirmAll && salaryValid && <div className="ecs-warning" role="alert">{t.ecsConfirmAll(salary.toFixed(2), orders.length)}</div>}
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost" onClick={confirmAll ? () => setConfirmAll(false) : onClose} disabled={saving}>{t.cancel}</button>
          <button className="ui-modal__btn ui-modal__btn--primary" onClick={handleApply} disabled={!canApply}>
            {saving ? t.ecsApplying : confirmAll ? t.ecsConfirmYes : t.ecsApply}
          </button>
        </div>
      </div>
    </div>
  );
}
