// ── Status meta: short badge labels + full tooltip descriptions ───────────────
// To translate: update the `ka` block below.
// To add a status: add an entry to both `en` and `ka`.

export interface StatusMetaEntry {
  /** Short label shown inside the badge */
  short: string;
  /** Full human-readable meaning shown as a tooltip on hover */
  description: string;
}

type LangKey = 'en' | 'ka';
type StatusMetaMap = Record<string, StatusMetaEntry>;

const STATUS_META_DATA: Record<LangKey, StatusMetaMap> = {
  en: {
    // ── GroupOrder flow ───────────────────────────────────────────────────────
    Pending:                         { short: 'Pending',          description: 'Order placed — awaiting acceptance by the operator.' },
    AcceptedGroupOrder:              { short: 'Accepted',         description: 'Company Accepted the Order' },
    OrderNotAccepted:                { short: 'Not Accepted',     description: 'Order was not accepted by the operator.' },
    CourierAssignedToPickUp:         { short: 'Assigned',         description: 'A courier has been assigned to pick up your order.' },
    CourierOnTheWayToPickUp:         { short: 'Picking Up',       description: 'Courier is on the way to your pickup address.' },
    CourierDeliveringToWarehouse:    { short: 'To Warehouse',     description: 'Courier is transporting your order to the warehouse.' },
    DeliveredToWarehouse:            { short: 'At Warehouse',     description: 'Order has arrived at the warehouse.' },
    AdminAcceptedOrderInWareHouse:   { short: 'In Warehouse',          description: 'Order inspected and cleared at the warehouse — ready for dispatch.' },
    CancelledBySender:               { short: 'Cancelled',        description: 'Order was cancelled by the sender.' },

    // ── Order (last-mile) flow ────────────────────────────────────────────────
    AcceptedOrder:                          { short: 'Accepted',          description: 'Company received the order.' },
    OrderIsOnItsWayToRecipientsCity:        { short: 'En Route',          description: 'Order is in transit to the recipient\'s city.' },
    CourierAssignedToDeliver:               { short: 'Courier Assigned',  description: 'A courier has been assigned for last-mile delivery.' },
    CourierDeliveringTheOrderToRecipient:   { short: 'Out for Delivery',  description: 'Courier has picked up the order and is on the way to the recipient.' },
    DeliveryPostponed:                      { short: 'Postponed',         description: 'Delivery could not be completed — courier will retry.' },
    DeliveredToRecipient:                   { short: 'Delivered',         description: 'Successfully delivered to the recipient.' },

    // ── Admin override ────────────────────────────────────────────────────────
    CancelledByAdmin:                { short: 'Cancelled',        description: 'Order was cancelled by the Company.' },
    AllDelivered:                    { short: 'All Delivered',    description: 'All packages in this group have been delivered.' },
  },

  ka: {
    // ── GroupOrder flow ───────────────────────────────────────────────────────
    Pending:                         { short: 'მოლოდინში',         description: 'შეკვეთა განთავსებულია — ელოდება ოპერატორის დადასტურებას.' },
    AcceptedGroupOrder:              { short: 'მიღებულია',          description: 'კომპანიამ შეკვეთა მიიღო.' },
    OrderNotAccepted:                { short: 'არ მიღებულა',        description: 'შეკვეთა ოპერატორმა არ მიიღო.' },
    CourierAssignedToPickUp:         { short: 'დაინიშნა',           description: 'კურიერი დაინიშნა შეკვეთის გასატანად.' },
    CourierOnTheWayToPickUp:         { short: 'გამოემართა',         description: 'კურიერი მიემართება გატანის მისამართზე.' },
    CourierDeliveringToWarehouse:    { short: 'საწყობისკენ',        description: 'კურიერს ამანათი საწყობში მიაქვს.' },
    DeliveredToWarehouse:            { short: 'მოწმდება',          description: 'ამანათი საწყობშია და მოწმდება.' },
    AdminAcceptedOrderInWareHouse:   { short: 'საწყობშია',         description: 'ამანათი შემოწმდა და საწყობში მიიღეს — მზადდება გასაგზავნად.' },
    CancelledBySender:               { short: 'გაუქმებულია',        description: 'გამგზავნმა შეკვეთა გაუქმა.' },

    // ── Order (last-mile) flow ────────────────────────────────────────────────
    AcceptedOrder:                          { short: 'მიღებულია',          description: 'კომპანიამ მიიღო შეკვეთა.' },
    OrderIsOnItsWayToRecipientsCity:        { short: 'გზაშია',             description: 'ამანათი მიმღების ქალაქისკენ მიდის.' },
    CourierAssignedToDeliver:               { short: 'კურიერი დაინიშნა',   description: 'კურიერი დაინიშნა ამანათის მისატანად.' },
    CourierDeliveringTheOrderToRecipient:   { short: 'მიტანის პროცესში',   description: 'კურიერმა მიიღო ამანათი და მალე ჩაგბარდებათ.' },
    DeliveryPostponed:                      { short: 'გადადებულია',        description: 'მიტანა ვერ შედგა — კურიერი ხელახლა შეეცდება.' },
    DeliveredToRecipient:                   { short: 'ჩაბარდა',            description: 'ამანათი წარმატებით ჩაბარდა მიმღებს.' },

    // ── Admin override ────────────────────────────────────────────────────────
    CancelledByAdmin:                { short: 'გაუქმებულია',        description: 'კომპანიამ შეკვეთა გააუქმა.' },
    AllDelivered:                    { short: 'ჩაბარდა სრულად',    description: 'ამ ჯგუფის ყველა ამანათი ჩაბარდა.' },
  },
};

/**
 * Returns the short label and tooltip description for a given status and language.
 * Falls back to a camelCase-split version of the status key if not found.
 */
export function getStatusMeta(status: string, lang: LangKey = 'en'): StatusMetaEntry {
  return (
    STATUS_META_DATA[lang][status] ??
    STATUS_META_DATA['en'][status] ?? {
      short: status.replace(/([A-Z])/g, ' $1').trim(),
      description: status,
    }
  );
}
