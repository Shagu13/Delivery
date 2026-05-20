using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Domain;

[Index(nameof(TrackingNumber), IsUnique = true)]
public class Order
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupOrderId { get; set; }
    public GroupOrder GroupOrder { get; set; } = null!;

    // ── Recipient / Delivery ─────────────────────────────────────────────────
    public required string RecipientFirstName { get; set; }
    public required string RecipientLastName  { get; set; }
    public required string RecipientPhone     { get; set; }
    public required string RecipientCity      { get; set; }
    public required string RecipientDistrict  { get; set; }
    public required string RecipientAddress   { get; set; }

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
    /// <summary>
    /// The weight tier the sender selected when placing this order.
    /// Null when no weight tier was chosen (orders placed before this feature, or not applicable).
    /// Used to determine pricing: if the tier's IsStandard = false, the tier's CustomPrice
    /// overrides all other pricing logic for this order.
    /// </summary>
    public Guid? WeightPriceTierId { get; set; }
    public WeightPriceTier? WeightPriceTier { get; set; }

    // ── Payment ──────────────────────────────────────────────────────────────
    /// <summary>Replaces the former bool IsPaid. Tracks whether product payment has been collected.</summary>
    public PaymentStatus ProductPaymentStatus { get; set; } = PaymentStatus.NotPaid;

    /// <summary>Which party pays the company's courier service fee (საკურიერო).</summary>
    public ServicePayer WhoPaysForCompanyService { get; set; } = ServicePayer.Sender;

    /// <summary>
    /// The cash amount the courier must collect from the recipient for the product itself (COD).
    /// Only meaningful when ProductPaymentStatus == NotPaid AND WhoPaysForCompanyService == Recipient.
    /// Null when not applicable.
    /// </summary>
    public decimal? AmountToCollectForPackage { get; set; }

    // ── Financials (admin-managed) ───────────────────────────────────────────
    /// <summary>
    /// The price the company charges for delivering this order.
    /// Auto-filled on creation using:
    ///   1. WeightPriceTier.CustomPrice if tier exists and IsStandard = false
    ///   2. Customer negotiated tier (capital / city / district)
    ///   3. District.CompanyServicePrice fallback
    /// Admin can override at any time.
    /// </summary>
    public decimal CompanyServicePrice { get; set; } = 0;

    /// <summary>
    /// Salary amount the admin allocates to the courier for delivering this order.
    /// Filled by admin individually at end of day.
    /// </summary>
    public decimal? CourierSalary { get; set; }

    /// <summary>
    /// Profit for the company: CompanyServicePrice - CourierSalary.
    /// Calculated automatically when CourierSalary is set.
    /// </summary>
    public decimal? CompanyRevenue { get; set; }

    /// <summary>
    /// The cash amount the courier collected from the recipient for the product itself (COD).
    /// Null when the product was pre-paid or payment was not collected (e.g. returned order).
    /// Populated by admin when closing the day settlement.
    /// </summary>
    public decimal? AmountOfCashCollected { get; set; }

    // ── Status & tracking ────────────────────────────────────────────────────
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public required string TrackingNumber { get; set; }

    // ── Timestamps ───────────────────────────────────────────────────────────
    public DateTime  CreatedAt                { get; set; } = DateTime.UtcNow;
    public DateTime? PickedUpFromWarehouseAt  { get; set; }
    public DateTime? DeliveredAt              { get; set; }

    /// <summary>
    /// Auto-filled when courier confirms receipt of a non-Tbilisi order
    /// (status → CourierDeliveringTheOrderToRecipient). Set to received date + 1 day.
    /// </summary>
    public DateTime? DeliveryDateFrom { get; set; }

    /// <summary>
    /// Auto-filled when courier confirms receipt of a non-Tbilisi order.
    /// Set to received date + 4 days.
    /// </summary>
    public DateTime? DeliveryDateTo { get; set; }

    // ── Postpone info ─────────────────────────────────────────────────────────
    /// <summary>Reason the courier could not complete the last delivery attempt.</summary>
    public PostponeReason? PostponeReason { get; set; }

    /// <summary>Timestamp of the most recent postponement.</summary>
    public DateTime? PostponedAt { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────
    public ICollection<TrackingEvent> TrackingEvents { get; set; } = new List<TrackingEvent>();
}
