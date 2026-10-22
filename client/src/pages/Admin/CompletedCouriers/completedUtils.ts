import type { Courier } from '../../../api/couriers';
import type { AdminOrderItem } from '../AdminOrdersPage';
import { toDateKey } from '../../../utils/georgianTime';

/** The Delivery list's order shape, plus the cash the courier was expected to collect. */
export type DeliveryOrder = AdminOrderItem & { expectedCourierCash: number };

export type DateKind = 'day' | 'range';

export interface CompletedFilterState {
  leg: 'deliveries' | 'pickups';
  /** '' = every courier. */
  courierId: string;
  dateKind: DateKind;
  dayKey: string;
  fromKey: string;
  toKey: string;
}

/** Mirrors `CompletedRange.MaxDays` on the backend — a longer range is rejected with 422. */
export const MAX_RANGE_DAYS = 93;

function keyToUtcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Days covered by an inclusive [from..to] key range (a single day = 1). */
export function inclusiveDays(fromKey: string, toKey: string): number {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / 86_400_000) + 1;
}

export function shiftDateKey(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + delta));
}

/** The effective inclusive range for the current filter. */
export function effectiveRange(f: CompletedFilterState): { from: string; to: string } {
  return f.dateKind === 'day' ? { from: f.dayKey, to: f.dayKey } : { from: f.fromKey, to: f.toKey };
}

export type RangeProblem = 'incomplete' | 'reversed' | 'tooLong' | null;

export function rangeProblem(from: string, to: string): RangeProblem {
  if (!from || !to) return 'incomplete';
  if (from > to) return 'reversed'; // ISO day keys sort lexically
  if (inclusiveDays(from, to) > MAX_RANGE_DAYS) return 'tooLong';
  return null;
}

export interface CourierGroup<T> {
  courierId: string;
  name: string;
  /** "@username · City, District" when the courier is in the roster, else empty. */
  subtitle: string;
  isDeleted: boolean;
  items: T[];
}

/** Groups rows under their courier, busiest courier first. */
export function groupByCourier<T>(
  items: T[],
  courierIdOf: (item: T) => string | null,
  fallbackNameOf: (item: T) => string,
  courierById: Map<string, Courier>,
): CourierGroup<T>[] {
  const groups = new Map<string, CourierGroup<T>>();
  for (const item of items) {
    const courierId = courierIdOf(item);
    if (!courierId) continue;
    let group = groups.get(courierId);
    if (!group) {
      const courier = courierById.get(courierId);
      group = {
        courierId,
        name: courier?.fullName ?? fallbackNameOf(item),
        subtitle: courier ? `@${courier.username} · ${courier.assignedCity}, ${courier.assignedDistrict}` : '',
        isDeleted: courier?.isDeleted ?? false,
        items: [],
      };
      groups.set(courierId, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
}

/** Where the courier went: a Return is collected from `returnPickup*`, everything else goes to the recipient. */
export function deliveryLocation(o: AdminOrderItem, lang: 'ka' | 'en'): { city: string; address: string } {
  if (o.orderType === 'Return' && o.returnPickupCity) {
    return { city: o.returnPickupCity, address: o.returnPickupAddress ?? '' };
  }
  const city = lang === 'ka' && o.recipientCityGeo ? o.recipientCityGeo : o.recipientCity;
  return { city, address: o.recipientAddress };
}
