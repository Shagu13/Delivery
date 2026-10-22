import { useMemo, useState } from 'react';
import type { CompletedDelivery } from '../../../api/couriers';
import { useLanguage } from '../../../contexts/useLanguage';
import { formatGeorgianDateTime } from '../../../utils/georgianTime';
import { deliveryLocation, type CourierGroup, type DeliveryOrder } from './completedUtils';
import './completed-couriers.css';

type Entry = CompletedDelivery<DeliveryOrder>;

const money = (n: number) => `₾${n.toFixed(2)}`;

interface Props {
  group: CourierGroup<Entry>;
  startOpen: boolean;
  onView: (entry: Entry) => void;
}

/** One courier's finished last-mile orders: delivered, billable-failed, and standalone Returns. */
export function CompletedDeliveryGroup({ group, startOpen, onView }: Props) {
  const { t, lang } = useLanguage();
  const [expanded, setExpanded] = useState(startOpen);

  const totals = useMemo(() => {
    let completed = 0;
    let failed = 0;
    let salary = 0;
    let cod = 0;
    for (const e of group.items) {
      if (e.isFailed) failed++; else completed++;
      salary += e.order.courierSalary ?? 0;
      // A failed attempt collected no cash.
      if (!e.isFailed) cod += e.order.expectedCourierCash;
    }
    return { completed, failed, salary, cod };
  }, [group.items]);

  const resultLabel = (e: Entry) =>
    e.isFailed ? t.ccpResultFailed
    : e.order.orderType === 'Return' ? t.ccpResultReturned
    : t.ccpResultDelivered;

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div
        className="go-row-header"
        onClick={() => setExpanded(v => !v)}
        style={{ cursor: 'pointer', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', opacity: group.isDeleted ? 0.6 : 1 }}
      >
        <svg className={`go-chevron ${expanded ? 'go-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div className="courier-name">{group.name}</div>
          {group.subtitle && <div className="courier-username">{group.subtitle}</div>}
        </div>
        <div className="ccp-chips">
          <span className="ccp-chip ccp-chip--accent">{t.ccpCompletedCount(totals.completed)}</span>
          {totals.failed > 0 && <span className="ccp-chip ccp-chip--danger">{t.ccpFailedCount(totals.failed)}</span>}
          <span className="ccp-chip">{t.crwSalaryBadge} {money(totals.salary)}</span>
          <span className="ccp-chip">COD {money(totals.cod)}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-3)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="go-orders-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>{t.aopThTracking}</th>
                  <th>{t.crwThSender}</th>
                  <th>{t.crwThCityAddress}</th>
                  <th>{t.ccpThResult}</th>
                  <th>COD</th>
                  <th>{t.crwThSvcPrice}</th>
                  <th>{t.crwThCourierSalary}</th>
                  <th>{t.ccpThCompleted}</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map(e => {
                  const o = e.order;
                  const place = deliveryLocation(o, lang);
                  return (
                    <tr
                      key={o.id}
                      className="ccp-row"
                      tabIndex={0}
                      onClick={() => onView(e)}
                      onKeyDown={ev => { if (ev.key === 'Enter') onView(e); }}
                    >
                      <td><span className="tn-badge">{o.trackingNumber}</span></td>
                      <td style={{ fontWeight: 600 }}>{o.senderBusinessName || '—'}</td>
                      <td>
                        <div>{place.city}</div>
                        <div className="ccp-sub">{place.address}</div>
                      </td>
                      <td>
                        <span className={`status-badge ${e.isFailed ? 'status-badge--cancelled' : 'status-badge--delivered'}`}>
                          {resultLabel(e)}
                        </span>
                        {e.isFailed && e.failureReason && (
                          <div className="ccp-sub" style={{ marginTop: 3 }}>
                            {(t.cdCancelReasons as Record<string, string>)[e.failureReason] ?? e.failureReason}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {!e.isFailed && o.expectedCourierCash > 0 ? money(o.expectedCourierCash) : '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{money(o.companyServicePrice)}</td>
                      <td>
                        {o.courierSalary != null
                          ? <span style={{ color: '#f97316', fontWeight: 600 }}>{money(o.courierSalary)}</span>
                          : <span style={{ opacity: 0.4, fontSize: '0.78rem' }}>—</span>}
                      </td>
                      <td className="ccp-sub" style={{ whiteSpace: 'nowrap' }}>{formatGeorgianDateTime(e.completedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
