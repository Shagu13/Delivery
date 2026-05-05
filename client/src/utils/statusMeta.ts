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
    AcceptedGroupOrder:              { short: 'Accepted',         description: 'Order accepted — a pickup courier is being assigned.' },
    OrderNotAccepted:                { short: 'Not Accepted',     description: 'Order was not accepted by the operator.' },
    CourierAssignedToPickUp:         { short: 'Assigned',         description: 'A courier has been assigned to pick up your order.' },
    CourierOnTheWayToPickUp:         { short: 'Picking Up',       description: 'Courier is on the way to your pickup address.' },
    CourierDeliveringToWarehouse:    { short: 'To Warehouse',     description: 'Courier is transporting your order to the warehouse.' },
    DeliveredToWarehouse:            { short: 'At Warehouse',     description: 'Order has arrived at the warehouse.' },
    AdminAcceptedOrderInWareHouse:   { short: 'In Warehouse',          description: 'Order inspected and cleared at the warehouse — ready for dispatch.' },
    CancelledBySender:               { short: 'Cancelled',        description: 'Order was cancelled by the sender.' },

    // ── Order (last-mile) flow ────────────────────────────────────────────────
    AcceptedOrder:                   { short: 'Accepted',         description: 'Order accepted for last-mile delivery.' },
    OrderIsOnItsWayToRecipientsCity: { short: 'En Route',         description: 'Order is in transit to the recipient\'s city.' },
    CourierAssignedToDeliver:        { short: 'Courier is Assigned',  description: 'A courier has been assigned for last-mile delivery.' },
    CourierRecievedOrderToDeliver:   { short: 'With Courier',     description: 'Courier has picked up the order and is on the way to the recipient.' },
    DeliveredToRecipient:            { short: 'Delivered',        description: 'Successfully delivered to the recipient.' },

    // ── Admin override ────────────────────────────────────────────────────────
    CancelledByAdmin:                { short: 'Cancelled',        description: 'Order was cancelled by an admin.' },
  },

  ka: {
    // ── GroupOrder flow ───────────────────────────────────────────────────────
    Pending:                         { short: 'მოლოდინში',         description: 'შეკვეთა განთავსებულია — ელოდება ოპერატორის დადასტურებას.' },
    AcceptedGroupOrder:              { short: 'მიღებულია',          description: 'შეკვეთა მიღებულია — კურიერი ინიშნება გასატანად.' },
    OrderNotAccepted:                { short: 'არ მიღებულა',        description: 'შეკვეთა ოპერატორმა არ მიიღო.' },
    CourierAssignedToPickUp:         { short: 'დაინიშნა',           description: 'კურიერი დაინიშნა შეკვეთის გასატანად.' },
    CourierOnTheWayToPickUp:         { short: 'გამოემართა',         description: 'კურიერი მიემართება გატანის მისამართზე.' },
    CourierDeliveringToWarehouse:    { short: 'საწყობისკენ',        description: 'კურიერი ამანათს საწყობში მიაქვს.' },
    DeliveredToWarehouse:            { short: 'მოწმდება',          description: 'ამანათი საწყობში ჩავიდა.' },
    AdminAcceptedOrderInWareHouse:   { short: 'საწყობშია',         description: 'ამანათი შემოწმდა და საწყობში მიიღეს — მზადდება გასაგზავნად.' },
    CancelledBySender:               { short: 'გაუქმებულია',        description: 'გამგზავნმა შეკვეთა გაუქმა.' },

    // ── Order (last-mile) flow ────────────────────────────────────────────────
    AcceptedOrder:                   { short: 'მიღებულია',          description: 'ამანათი მიღებულია ბოლო მილის მიტანისთვის.' },
    OrderIsOnItsWayToRecipientsCity: { short: 'გზაშია',             description: 'ამანათი მიმღების ქალაქისკენ მიდის.' },
    CourierAssignedToDeliver:        { short: 'კურიერი დაინიშნა',          description: 'კურიერი დაინიშნა ბოლო მილის მიტანისთვის.' },
    CourierRecievedOrderToDeliver:   { short: 'კურიერთანაა',        description: 'კურიერს ამანათი გადაეცა და მიმღებისკენ მიდის.' },
    DeliveredToRecipient:            { short: 'ჩაბარდა',            description: 'ამანათი წარმატებით ჩაბარდა მიმღებს.' },

    // ── Admin override ────────────────────────────────────────────────────────
    CancelledByAdmin:                { short: 'გაუქმებულია',        description: 'ადმინმა შეკვეთა გაუქმა.' },
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
