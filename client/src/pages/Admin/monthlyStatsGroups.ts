import type { MonthlyStatusGroup } from '../../api/adminGroupOrders';
import type { Translations } from '../../contexts/translations';

/** Display order of the outcome buckets, used by the cards, pie, daily bars and detail list. */
export const MONTHLY_GROUPS: readonly MonthlyStatusGroup[] = ['Delivered', 'Active', 'Postponed', 'Cancelled', 'Returned'];

export const MONTHLY_GROUP_COLORS: Record<MonthlyStatusGroup, string> = {
    Delivered: '#059669',
    Active:    '#d97706',
    Postponed: '#8b5cf6',
    Cancelled: '#dc2626',
    Returned:  '#64748b',
};

export function monthlyGroupLabel(t: Translations, group: MonthlyStatusGroup): string {
    switch (group) {
        case 'Delivered': return t.omGroupDelivered;
        case 'Active':    return t.omGroupActive;
        case 'Postponed': return t.omGroupPostponed;
        case 'Cancelled': return t.omGroupCancelled;
        case 'Returned':  return t.omGroupReturned;
    }
}
