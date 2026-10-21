using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Domain;

[Index(nameof(TrackingNumber), IsUnique = true)]
public class Order
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Null for standalone Return orders created directly (not through a GroupOrder).
    /// Always set for Send and Exchange orders which are always part of a GroupOrder.
    /// </summary>
    public Guid? GroupOrderId { get; set; }
    public GroupOrder? GroupOrder { get; set; }

    // ── Order type ───────────────────────────────────────────────────────────
    /// <summary>
    /// Whether this is a standard Send, a Return, or an Exchange.
    /// Default: Send. Set by sender when placing the order.
    /// For Return: standalone order — courier goes to ReturnPickupAddress to collect,
    ///             then brings to warehouse; admin marks ReturnedToSender when done.
    /// For Exchange: operationally identical to Send; labelled for reporting purposes.
    /// </summary>
    public OrderType OrderType { get; set; } = OrderType.Send;

    // ── Customer (set for standalone Return orders; null for group-order-based orders) ──
    /// <summary>
    /// Set for standalone Return orders to identify the sender.
    /// Null for Send/Exchange orders — use GroupOrder.CustomerId instead.
    /// </summary>
    public Guid?     CustomerId { get; set; }
    public Customer? Customer   { get; set; }

    // ── Recipient / Delivery ─────────────────────────────────────────────────
    /// <summary>Recipient's full name — a single united field (first + last are not stored separately).</summary>
    public required string RecipientName      { get; set; }
    public required string RecipientPhone     { get; set; }
    public required string RecipientCity      { get; set; }
    public required string RecipientDistrict  { get; set; }
    public required string RecipientAddress   { get; set; }

    /// <summary>
    /// Exact coordinates of the address the courier navigates to — captured when
    /// the sender picks a geocoded autocomplete suggestion. For Send/Exchange this
    /// is the recipient address; for Return it is the return-pickup address. Null
    /// when the address was typed manually (no suggestion selected).
    /// </summary>
    public double? Latitude  { get; set; }
    public double? Longitude { get; set; }

    // ── Return pickup (only for OrderType == Return) ─────────────────────────
    /// <summary>
    /// The address where the courier must go to collect the parcel for a Return.
    /// This is the recipient's location — where the parcel currently sits.
    /// Null for Send and Exchange orders.
    /// </summary>
    public string? ReturnPickupAddress  { get; set; }
    public string? ReturnPickupCity     { get; set; }
    public string? ReturnPickupDistrict { get; set; }

    // ── Assignment ───────────────────────────────────────────────────────────
    public Guid?     CourierId   { get; set; }
    public Courier?  Courier     { get; set; }
    public Guid?     WarehouseId { get; set; }
    public Warehouse? Warehouse  { get; set; }

    // ── Package details ──────────────────────────────────────────────────────
    public string? Description { get; set; }

    /// <summary>Whether the product is made of glass or other easily breakable material.</summary>
    public bool IsFragile { get; set; } = false;

    // ── Weight tier ───────────────────────────────────────────────────────────
    public Guid? WeightPriceTierId { get; set; }
    public WeightPriceTier? WeightPriceTier { get; set; }

    // ── Payment ──────────────────────────────────────────────────────────────
    public PaymentStatus ProductPaymentStatus { get; set; } = PaymentStatus.NotPaid;
    public ServicePayer WhoPaysForCompanyService { get; set; } = ServicePayer.Sender;
    public decimal? AmountToCollectForPackage { get; set; }

    /// <summary>
    /// The product price as it stood before delivery (the COD portion; the fee is excluded for
    /// all-in orders). Kept in step with <see cref="AmountToCollectForPackage"/> until the
    /// order is delivered, then frozen — a courier correction at the door overwrites
    /// <see cref="AmountToCollectForPackage"/> but never this, so the admin can tell the
    /// original price from the corrected one. Reference only; no finance formula reads it.
    /// </summary>
    public decimal? OriginalPackagePrice { get; set; }

    // ── Payment tracking ─────────────────────────────────────────────────────
    public CompanyServicePaymentStatus CompanyServicePaymentStatus { get; set; }
        = CompanyServicePaymentStatus.Unpaid;
    public bool HasCompanyPaidTheSender { get; set; } = false;

    // ── Per-order settlement (admin-recorded, source of truth for finance) ─────
    /// <summary>
    /// COD payout — company → customer. True once the company has paid the customer
    /// back the package COD it collected for this order. Set per order by admin on
    /// the finance page; some orders in a batch may be paid out before others.
    /// </summary>
    public bool      IsCollectedCodPaidToCustomer { get; set; } = false;
    /// <summary>Amount the company paid the customer for this order's COD. Null until paid.</summary>
    public decimal?  CodPaidToCustomerAmount      { get; set; }
    /// <summary>When the COD payout was recorded. Null until paid.</summary>
    public DateTime? CodPaidToCustomerAt          { get; set; }

    /// <summary>
    /// Service fee — customer → company. Amount the customer paid the company for this
    /// order's sender-paid service fee. Only meaningful when
    /// <see cref="WhoPaysForCompanyService"/> == Sender; the paid/unpaid state lives on
    /// <see cref="CompanyServicePaymentStatus"/>. Null until paid.
    /// </summary>
    public decimal?  ServicePaidByCustomerAmount  { get; set; }
    /// <summary>When the sender-paid service fee payment was recorded. Null until paid.</summary>
    public DateTime? ServicePaidByCustomerAt      { get; set; }

    // ── Per-order courier settlement (admin-recorded; replaces CourierSettlement) ──
    /// <summary>
    /// Running total the company has paid the courier toward this order's
    /// <see cref="CourierSalary"/>. Accumulates across partial payments. Null until
    /// the first payment is recorded.
    /// </summary>
    public decimal?  CourierSalaryPaidAmount            { get; set; }
    /// <summary>When the most recent courier-salary payment was recorded. Null until paid.</summary>
    public DateTime? CourierSalaryPaidAt               { get; set; }

    /// <summary>
    /// Running total of COD cash the courier has physically handed over to the company
    /// for this order. Accumulates across partial transfers. Null until any is handed over.
    /// </summary>
    public decimal?  CodTransferedToCompanyByCourier    { get; set; }
    /// <summary>When the most recent courier→company COD transfer was recorded. Null until any.</summary>
    public DateTime? CodTransferedToCompanyByCourierAt  { get; set; }

    /// <summary>
    /// Special case (sender-pays only): the service fee the customer owes was settled by
    /// netting it out of the COD payout to the customer rather than collected as a
    /// separate cash inflow. When true the service fee is NOT counted again as company
    /// cash-in (see <c>OrderFinance.ServiceInflow</c>); it was already kept from the COD.
    /// </summary>
    public bool IsCompanyServicePriceIncludedSpecialCase { get; set; } = false;

    /// <summary>
    /// Special case: the courier kept their salary out of the COD cash they collected, so
    /// the amount transferred to the company is COD minus salary (rather than the full COD
    /// with a separate salary payout). Drives how the courier settlement command splits
    /// the collected cash.
    /// </summary>
    public bool IsCourierSalaryIncludedSpecialCase       { get; set; } = false;

    // ── Dilo ↔ tenant settlement (per-order; only for tenant-owned orders) ────
    // SEPARATE from the *Customer fields above (which are the tenant↔its-customers tier).
    // These record the company (dilo) settling directly with the TENANT, per order.
    /// <summary>COD dilo has paid the tenant for this order (dilo owes the tenant). Null until paid.</summary>
    public decimal?  CodPaidToTenantAmount        { get; set; }
    /// <summary>When the dilo→tenant COD payout was recorded. Null until paid.</summary>
    public DateTime? CodPaidToTenantAt            { get; set; }
    /// <summary>Service fee the tenant has paid dilo for this order (sender-pays only; tenant owes dilo). Null until paid.</summary>
    public decimal?  ServicePaidByTenantAmount    { get; set; }
    /// <summary>When the tenant→dilo service payment was recorded. Null until paid.</summary>
    public DateTime? ServicePaidByTenantAt        { get; set; }

    /// <summary>
    /// When true, the price the sender entered for this package was the all-in amount
    /// (product + company service fee bundled). The service fee is resolved separately
    /// and subtracted, so <see cref="AmountToCollectForPackage"/> stores only the product
    /// portion and <see cref="CompanyServicePrice"/> the fee. When false (default), the
    /// entered price is the product price and the fee is added on top as today.
    /// </summary>
    public bool IsCompanyServicePriceIncluded { get; set; } = false;

    // ── Financials (admin-managed) ───────────────────────────────────────────
    public decimal CompanyServicePrice { get; set; } = 0;
    public decimal? CourierSalary { get; set; }
    public decimal? CompanyRevenue { get; set; }
    public decimal? AmountOfCashCollected { get; set; }

    // ── Status & tracking ────────────────────────────────────────────────────
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public required string TrackingNumber { get; set; }

    /// <summary>
    /// The partner's own order number for orders placed through the partner API
    /// (onway's <c>order_number</c> equivalent). Used to de-duplicate retried
    /// submissions and to let a partner reconcile/track by their own reference.
    /// Null for orders placed through the web/admin UI.
    /// </summary>
    public string? ExternalReference { get; set; }

    /// <summary>
    /// True when this order was created by staff through the admin "+ Add Package"
    /// walk-in flow rather than placed by the customer. The order is still fully real
    /// for admin, courier, and finance/settlement purposes — this flag only hides it
    /// from the customer-facing portal (dashboard, statistics, "my" finance/settlement
    /// reads) so office packages never appear in a customer's own history. Mirrored
    /// from <see cref="GroupOrder.IsWalkIn"/> onto every child order, and set directly
    /// on standalone walk-in Returns.
    /// </summary>
    public bool IsWalkIn { get; set; } = false;

    // ── Soft delete ──────────────────────────────────────────────────────────
    /// <summary>
    /// Set when an admin deletes this package from the "Delete Package" page.
    /// Null = active. A non-null value hides the order from every read in the system
    /// (admin, courier, customer, finance, history, public tracking, Partner API) via a
    /// global EF query filter. There is no restore path — the row is kept only so finance
    /// and audit history are not corrupted. When the last non-deleted child of a
    /// <see cref="GroupOrder"/> is deleted the parent batch is stamped too.
    /// </summary>
    public DateTime? DateDeleted { get; set; }

    // ── Timestamps ───────────────────────────────────────────────────────────
    public DateTime  CreatedAt                { get; set; } = CustomTime.Now;

    /// <summary>
    /// When a courier was assigned to this order (last-mile delivery for Send/
    /// Exchange, or pickup for a Return). Set the moment Order.CourierId is first
    /// populated; used to list a courier's orders by the day they were assigned.
    /// </summary>
    public DateTime? AssignedToCourierAt      { get; set; }
    public DateTime? PickedUpFromWarehouseAt  { get; set; }
    public DateTime? PickedUpFromRecipientAt  { get; set; }
    public DateTime? DeliveredToWarehouseAt   { get; set; }
    public DateTime? DeliveredAt              { get; set; }
    public DateTime? DeliveryDateFrom         { get; set; }
    public DateTime? DeliveryDateTo           { get; set; }

    // ── Postpone info ─────────────────────────────────────────────────────────
    public PostponeReason? PostponeReason { get; set; }
    /// <summary>Free-text note captured when the reason is "Other". Null otherwise.</summary>
    public string?    PostponeComment     { get; set; }
    public DateTime? PostponedAt          { get; set; }

    // ── Cancellation info (courier-cancelled at delivery) ─────────────────────
    /// <summary>Why the courier cancelled the delivery. Null unless cancelled by a courier.</summary>
    public CancellationReason? CancellationReason { get; set; }
    /// <summary>Free-text note captured when the reason is "Other". Null otherwise.</summary>
    public string?   CancellationComment { get; set; }
    public DateTime? CancelledAt         { get; set; }

    /// <summary>
    /// When an admin marked this already-cancelled order (cancelled by admin, or declined by a
    /// courier → OrderNotAccepted) as physically returned to the sender. Null until marked.
    /// Purely a logistics marker: the order keeps its cancelled <see cref="Status"/> and its
    /// billing is unchanged (finance keys off <see cref="CancellationReason"/>, not this field).
    /// Send/Exchange only — standalone Returns run their own returned-to-sender flow.
    /// </summary>
    public DateTime? CancelledReturnedToSenderAt { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────
    public ICollection<TrackingEvent> TrackingEvents { get; set; } = new List<TrackingEvent>();
}
