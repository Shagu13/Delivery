using Domain.Enums;

namespace Domain;

/// <summary>
/// Universal payment ledger record.
/// Every financial movement in the system creates one of these records:
///   - Sender → Company  (service fee collection, SenderPaysCompany)
///   - Company → Sender  (COD forwarding,          CompanyPaysSender)
///   - Company → Courier (salary payout,            CompanyPaysCourier)
///   - Courier → Company (cash/revenue handover,    CourierHandsOverRevenue)
///
/// Orders are linked via the PaymentRequestId FK on the Order entity.
/// </summary>
public class PaymentRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // ── Type & status ─────────────────────────────────────────────────────────
    public PaymentRequestType   Type   { get; set; }
    public PaymentRequestStatus Status { get; set; } = PaymentRequestStatus.Pending;

    // ── Financial ─────────────────────────────────────────────────────────────
    /// <summary>
    /// Total amount this request covers (sum of relevant price field across linked orders).
    /// For CourierHandsOverRevenue / CompanyPaysCourier this comes from DailySettlement totals.
    /// </summary>
    public decimal TotalAmount { get; set; }

    /// <summary>
    /// Amount confirmed as received/paid so far.
    /// Equal to TotalAmount when Status == Confirmed.
    /// </summary>
    public decimal AmountConfirmed { get; set; } = 0;

    // ── Parties ───────────────────────────────────────────────────────────────
    /// <summary>Set for SenderPaysCompany and CompanyPaysSender requests.</summary>
    public Guid? CustomerId { get; set; }
    public Customer? Customer { get; set; }

    /// <summary>Set for CompanyPaysCourier and CourierHandsOverRevenue requests.</summary>
    public Guid? CourierId { get; set; }
    public Courier? Courier { get; set; }

    /// <summary>
    /// Linked daily settlement for courier-related requests.
    /// Null for sender-related requests.
    /// </summary>
    public Guid? DailySettlementId { get; set; }
    public DailySettlement? DailySettlement { get; set; }

    // ── Admin note ────────────────────────────────────────────────────────────
    public string? Note { get; set; }

    // ── Timestamps ───────────────────────────────────────────────────────────
    public DateTime  CreatedAt    { get; set; } = DateTime.UtcNow;
    public DateTime? ConfirmedAt  { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────
    /// <summary>
    /// The individual orders covered by this payment request.
    /// Navigated via the FK PaymentRequestId on Order.
    /// </summary>
    public ICollection<Order> Orders { get; set; } = new List<Order>();
}
