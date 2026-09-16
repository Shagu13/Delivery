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
    OrderNotAccepted:                { short: 'Not Accepted',     description: 'Package was cancelled.' },
    CourierAssignedToPickUp:         { short: 'Assigned',         description: 'A courier has been assigned to pick up your order.' },
    CourierDeliveringToWarehouse:    { short: 'To Warehouse',     description: 'Courier is transporting your order to the warehouse.' },
    DeliveredToWarehouse:            { short: 'At Warehouse',     description: 'Order has arrived at the warehouse.' },
    AdminAcceptedOrderInWareHouse:   { short: 'In Warehouse',     description: 'Order inspected and cleared at the warehouse — ready for dispatch.' },
    CancelledBySender:               { short: 'Cancelled (Customer)', description: 'Order was cancelled by the sender.' },

    // ── Order (last-mile) flow ────────────────────────────────────────────────
    AcceptedOrder:                          { short: 'Accepted',          description: 'Company received the order.' },
    OrderIsOnItsWayToRecipientsCity:        { short: 'En Route',          description: 'Order is in transit to the recipient\'s city.' },
    CourierAssignedToDeliver:               { short: 'Courier Assigned',  description: 'A courier has been assigned for last-mile delivery.' },
    CourierDeliveringTheOrderToRecipient:   { short: 'Out for Delivery',  description: 'Courier has picked up the order and is on the way to the recipient.' },
    DeliveryPostponed:                      { short: 'Postponed',         description: 'Delivery could not be completed — courier will retry.' },
    DeliveredToRecipient:                   { short: 'Delivered',         description: 'Successfully delivered to the recipient.' },

    // ── Admin override ────────────────────────────────────────────────────────
    CancelledByAdmin:                { short: 'Cancelled (Company)', description: 'Order was cancelled by the Company.' },
    AllDelivered:                    { short: 'All Delivered',    description: 'All packages in this group have been delivered or cancelled.' },

    // ── Return flow (standalone Return orders) ────────────────────────────────
    PickedUpFromRecipient:           { short: 'Picked Up',        description: 'Courier has collected the return parcel from the recipient.' },
    DeliveredReturnOrderToWarehouse: { short: 'At Warehouse',     description: 'Return parcel has arrived at the warehouse.' },

    // ── Return & Exchange terminals ───────────────────────────────────────────
    ReturnedToSender:                { short: 'Returned',         description: 'Parcel has been returned to the sender.' },
    ExchangeCompleted:               { short: 'Exchanged',        description: 'Exchange parcel has been delivered to the recipient.' },
  },

  ka: { 
    // ── GroupOrder flow ───────────────────────────────────────────────────────
    Pending:                         { short: 'მოლოდინში',        description: 'შეკვეთა განხილვის მოლოდინშია.' },
    AcceptedGroupOrder:              { short: 'მიღებულია',        description: 'კომპანიამ შეკვეთა მიიღო.' },
    OrderNotAccepted:                { short: 'არ მიღებულა',      description: 'ამანათი გაუქმდა.' },
    CourierAssignedToPickUp:         { short: 'კურიერი დაინიშნა', description: 'კურიერი დაინიშნა თქვენი ამანათის ასაღებად.' },
    CourierDeliveringToWarehouse:    { short: 'საწყობისკენ',      description: 'კურიერს ამანათი საწყობში მიაქვს.' },
    DeliveredToWarehouse:            { short: 'საწყობშია',        description: 'კურიერმა ამანათი საწყობში მიიტანა.' },
    AdminAcceptedOrderInWareHouse:   { short: 'საწყობში',         description: 'ამანათი მზადაა გასაგზავნად.' },
    CancelledBySender:               { short: 'გაუქმდა', description: 'შეკვეთა გამგზავნმა გააუქმა.' },

    // ── Order (last-mile) flow ────────────────────────────────────────────────
    AcceptedOrder:                          { short: 'მიღებულია',        description: 'კომპანიამ შეკვეთა მიიღო.' },
    OrderIsOnItsWayToRecipientsCity:        { short: 'გზაშია',           description: 'ამანათი მიმღების ქალაქისკენ გაიგზავნა.' },
    CourierAssignedToDeliver:               { short: 'კურიერი დაინიშნა', description: 'კურიერი დაინიშნა ამანათის მისატანად.' },
    CourierDeliveringTheOrderToRecipient:   { short: 'მიტანის პროცესში', description: 'კურიერმა მიიღო ამანათი და მალე ჩაგბარდებათ.' },
    DeliveryPostponed:                      { short: 'გადადებულია',       description: 'მიტანა ვერ მოხდა — კურიერი ხელახლა შეეცდება.' },
    DeliveredToRecipient:                   { short: 'ჩაბარდა',           description: 'ამანათი წარმატებით ჩაბარდა მიმღებს.' },

    // ── Admin override ────────────────────────────────────────────────────────
    CancelledByAdmin:                { short: 'გაუქმდა', description: 'კომპანიამ შეკვეთა გააუქმა.' },
    AllDelivered:                    { short: 'ჩაბარდა სრულად',  description: 'ამ ჯგუფის ყველა ამანათი ჩაბარდა ან გაუქმდა.' },

    // ── Return flow (standalone Return orders) ────────────────────────────────
    PickedUpFromRecipient:           { short: 'აღებულია',         description: 'კურიერმა აიღო დასაბრუნებელი ამანათი მიმღებისგან.' },
    DeliveredReturnOrderToWarehouse: { short: 'საწყობშია',        description: 'დასაბრუნებელი ამანათი საწყობშია' },

    // ── Return & Exchange terminals ───────────────────────────────────────────
    ReturnedToSender:                { short: 'დაბრუნდა',         description: 'ამანათი გამგზავნს დაუბრუნდა.' },
    ExchangeCompleted:               { short: 'გაცვლა შედგა',     description: 'გაცვლილი ამანათი მიმღებს ჩაბარდა.' },
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
