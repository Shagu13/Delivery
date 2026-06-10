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
    public required string RecipientFirstName { get; set; }
    public required string RecipientLastName  { get; set; }
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

    // ── Payment tracking ─────────────────────────────────────────────────────
    public CompanyServicePaymentStatus CompanyServicePaymentStatus { get; set; }
        = CompanyServicePaymentStatus.Unpaid;
    public bool HasCompanyPaidTheSender { get; set; } = false;

    // ── Financials (admin-managed) ───────────────────────────────────────────
    public decimal CompanyServicePrice { get; set; } = 0;
    public decimal? CourierSalary { get; set; }
    public decimal? CompanyRevenue { get; set; }
    public decimal? AmountOfCashCollected { get; set; }

    // ── Status & tracking ────────────────────────────────────────────────────
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public required string TrackingNumber { get; set; }

    // ── Timestamps ───────────────────────────────────────────────────────────
    public DateTime  CreatedAt                { get; set; } = DateTime.UtcNow;

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
    public DateTime? PostponedAt          { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────
    public ICollection<TrackingEvent> TrackingEvents { get; set; } = new List<TrackingEvent>();
}
