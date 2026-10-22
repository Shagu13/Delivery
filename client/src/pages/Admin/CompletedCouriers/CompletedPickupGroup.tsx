import { useMemo, useState } from 'react';
import type { CompletedPickup } from '../../../api/couriers';
import { PhoneActions } from '../../../components/ui/PhoneActions';
import { useLanguage } from '../../../contexts/useLanguage';
import { formatGeorgianDateTime } from '../../../utils/georgianTime';
import type { CourierGroup } from './completedUtils';
import './completed-couriers.css';

interface Props {
  group: CourierGroup<CompletedPickup>;
  startOpen: boolean;
}

/** One courier's pickup batches that reached the warehouse in the selected period. */
export function CompletedPickupGroup({ group, startOpen }: Props) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(startOpen);

  const totalPackages = useMemo(
    () => group.items.reduce((sum, p) => sum + p.numberOfPackages, 0),
    [group.items],
  );

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
          <span className="ccp-chip ccp-chip--accent">{t.ccpBatchesCount(group.items.length)}</span>
          <span className="ccp-chip">{t.goPkgs(totalPackages)}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-3)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="go-orders-table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th>{t.crwThSender}</th>
                  <th>{t.crwThPickupLocation}</th>
                  <th>{t.crwThAddress}</th>
                  <th>{t.crwThPackages}</th>
                  <th>{t.crwThPickedUp}</th>
                  <th>{t.ccpThAtWarehouse}</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.senderBusinessName}</div>
                      <PhoneActions phone={p.senderPhone} />
                    </td>
                    <td>
                      <div>{p.pickUpCity}</div>
                      <div className="ccp-sub">{p.pickUpDistrict}</div>
                    </td>
                    <td className="ccp-sub" style={{ maxWidth: 220 }}>{p.pickUpAddress}</td>
                    <td style={{ fontWeight: 600 }}>{p.numberOfPackages}</td>
                    <td className="ccp-sub" style={{ whiteSpace: 'nowrap' }}>{formatGeorgianDateTime(p.pickedUpAt)}</td>
                    <td className="ccp-sub" style={{ whiteSpace: 'nowrap' }}>{formatGeorgianDateTime(p.deliveredToWarehouseAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
