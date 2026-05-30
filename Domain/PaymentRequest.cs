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
/// For CompanyPaysSender records, ServiceFeeOffset may be non-zero when the
/// company nets the sender's outstanding service fees against the COD payout.
/// Example: COD owed = ₾305.50, fees offset = ₾28.00 → net paid = ₾277.50
///   TotalAmount     = 305.50  (gross COD)
///   ServiceFeeOffset = 28.00  (service fees deducted from COD)
///   AmountConfirmed = 277.50  (net actually transferred to sender)
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
    /// Gross amount this request covers before any offsets.
    /// For CompanyPaysSender: sum of AmountToCollectForPackage across linked COD orders.
    /// For SenderPaysCompany: sum of CompanyServicePrice across linked orders.
    /// For courier requests: comes from DailySettlement totals.
    /// </summary>
    public decimal TotalAmount { get; set; }

    /// <summary>
    /// For CompanyPaysSender only: the amount of outstanding sender service fees
    /// that has been deducted from the COD payout (netted).
    /// Zero for all other request types.
    /// When set: the sender's selected Sender-payer orders are marked
    /// CompanyServicePaymentStatus = Paid simultaneously.
    /// </summary>
    public decimal ServiceFeeOffset { get; set; } = 0;

    /// <summary>
    /// Amount confirmed as received/paid so far.
    /// For CompanyPaysSender with netting: TotalAmount - ServiceFeeOffset.
    /// Equal to TotalAmount when Status == Confirmed and no offset.
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
    /// For CompanyPaysSender: the COD orders being paid out.
    /// For SenderPaysCompany: the service-fee orders being collected.
    /// Navigated via the FK PaymentRequestId on Order.
    /// </summary>
    public ICollection<Order> Orders { get; set; } = new List<Order>();
}
