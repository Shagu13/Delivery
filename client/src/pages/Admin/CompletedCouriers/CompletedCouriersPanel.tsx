import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  exportCompletedExcel, fetchCompletedDeliveries, fetchCompletedPickups,
  type CompletedDelivery, type Courier,
} from '../../../api/couriers';
import { useLanguage } from '../../../contexts/useLanguage';
import { georgianToday, toDateKey } from '../../../utils/georgianTime';
import type { AdminOrderItem } from '../AdminOrdersPage';
import { ViewOrderModal } from '../ViewOrderModal';
import { CompletedDeliveryGroup } from './CompletedDeliveryGroup';
import { CompletedFilters } from './CompletedFilters';
import { CompletedPickupGroup } from './CompletedPickupGroup';
import {
  effectiveRange, groupByCourier, rangeProblem,
  type CompletedFilterState, type DeliveryOrder,
} from './completedUtils';
import './completed-couriers.css';

type Entry = CompletedDelivery<DeliveryOrder>;

interface Props {
  token: string;
  couriers: Courier[];
  canSeeRevenue: boolean;
}

/**
 * Couriers → "Completed Orders": pick a leg (delivery / pickup), a courier (or all) and a day or date
 * range, and see what those couriers actually finished — delivered and billable-failed orders plus
 * standalone Returns on the delivery leg, warehouse-delivered batches on the pickup leg.
 */
export function CompletedCouriersPanel({ token, couriers, canSeeRevenue }: Props) {
  const { t, lang } = useLanguage();
  const todayKey = useMemo(() => toDateKey(georgianToday()), []);
  const [filters, setFilters] = useState<CompletedFilterState>({
    leg: 'deliveries', courierId: '', dateKind: 'day', dayKey: todayKey, fromKey: todayKey, toKey: todayKey,
  });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const patchFilters = useCallback((patch: Partial<CompletedFilterState>) => {
    setFilters(f => ({ ...f, ...patch }));
    setExportError(null);
  }, []);

  const { from, to } = effectiveRange(filters);
  const problem = rangeProblem(from, to);
  const ready = problem === null;
  const isDeliveries = filters.leg === 'deliveries';

  const deliveriesQuery = useQuery({
    queryKey: ['admin', 'couriers', 'completed', 'deliveries', filters.courierId, from, to] as const,
    queryFn: () => fetchCompletedDeliveries<DeliveryOrder>(token, filters.courierId, from, to),
    enabled: ready && isDeliveries,
  });
  const pickupsQuery = useQuery({
    queryKey: ['admin', 'couriers', 'completed', 'pickups', filters.courierId, from, to] as const,
    queryFn: () => fetchCompletedPickups(token, filters.courierId, from, to),
    enabled: ready && !isDeliveries,
  });
  const active = isDeliveries ? deliveriesQuery : pickupsQuery;

  const courierById = useMemo(() => new Map(couriers.map(c => [c.courierId, c])), [couriers]);
  const deliveryGroups = useMemo(
    () => groupByCourier(deliveriesQuery.data ?? [], e => e.order.courierId, e => e.order.courierFullName ?? '', courierById),
    [deliveriesQuery.data, courierById],
  );
  const pickupGroups = useMemo(
    () => groupByCourier(pickupsQuery.data ?? [], p => p.courierId, p => p.courierFullName, courierById),
    [pickupsQuery.data, courierById],
  );
  const groupCount = isDeliveries ? deliveryGroups.length : pickupGroups.length;

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportCompletedExcel(token, filters.leg, filters.courierId, from, to, lang);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : t.ccpError);
    } finally {
      setExporting(false);
    }
  };

  const [viewing, setViewing] = useState<AdminOrderItem | null>(null);
  const handleView = (entry: Entry) =>
    setViewing({ ...entry.order, cancellationReason: entry.failureReason, cancellationComment: entry.failureComment });

  // With a single courier picked there is only one group — open it straight away.
  const startOpen = filters.courierId !== '';

  return (
    <>
      <CompletedFilters
        filters={filters}
        onChange={patchFilters}
        couriers={couriers}
        todayKey={todayKey}
        problem={problem}
        canExport={ready && groupCount > 0}
        exporting={exporting}
        onExport={handleExport}
      />
      {exportError && <div className="ccp-problem" role="alert">{exportError}</div>}

      <div className="content-card">
        <div className="content-card__header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="content-card__title">{isDeliveries ? t.ccpTitleDeliveries : t.ccpTitlePickups}</span>
          {ready && active.data && (
            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
              {t.ccpCouriers(groupCount)}
            </span>
          )}
        </div>

        {!ready ? null
          : active.isLoading ? (
            <div className="go-loading"><div className="go-spinner" />{t.ccpLoading}</div>
          ) : active.isError ? (
            <div className="ccp-message ccp-message--error">{t.ccpError}</div>
          ) : groupCount === 0 ? (
            <div className="ccp-message">{isDeliveries ? t.ccpEmptyDeliveries : t.ccpEmptyPickups}</div>
          ) : isDeliveries ? (
            deliveryGroups.map(g => (
              <CompletedDeliveryGroup key={`${g.courierId}:${startOpen}`} group={g} startOpen={startOpen} onView={handleView} />
            ))
          ) : (
            pickupGroups.map(g => (
              <CompletedPickupGroup key={`${g.courierId}:${startOpen}`} group={g} startOpen={startOpen} />
            ))
          )}
      </div>

      <ViewOrderModal order={viewing} open={viewing !== null} onClose={() => setViewing(null)} showRevenue={canSeeRevenue} />
    </>
  );
}
