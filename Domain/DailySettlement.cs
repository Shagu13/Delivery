namespace Domain;

/// <summary>
/// Represents the end-of-day financial settlement for a single courier.
/// One record per courier per working day.
/// Once IsTheDayClosed is set to true the record is considered immutable.
///
/// Only stores immutable physical facts recorded at settlement time.
/// Stale snapshot fields (TotalCodOwedToSenders, TotalServiceFeesOwedBySenders,
/// CompanyNetCashAfterCod) were removed — those are derived live from Orders
/// and PaymentRequests so they never go stale.
/// </summary>
public class DailySettlement
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // ── Courier link ─────────────────────────────────────────────────────────
    public Guid CourierId { get; set; }
    public Courier Courier { get; set; } = null!;

    // ── Order counts ─────────────────────────────────────────────────────────
    /// <summary>
    /// Total packages the courier picked up from senders on this day.
    /// Populated by summing GroupOrder.NumberOfPackages across all
    /// GroupOrders the courier picked up on this day.
    /// </summary>
    public int TotalOrdersPickedUp { get; set; } = 0;

    /// <summary>Number of orders successfully delivered to recipients on this day.</summary>
    public int TotalOrdersDelivered { get; set; } = 0;

    // ── Cash collected ───────────────────────────────────────────────────────
    /// <summary>
    /// Total cash physically collected by the courier from recipients.
    /// For Recipient-payer orders: package COD + service fee bundled together.
    /// For Sender-payer orders: package COD only (service fee invoiced to sender separately).
    /// This is the actual cash in the courier's hands before salary deduction.
    /// Null when no cash-on-delivery orders were handled that day.
    /// </summary>
    public decimal? TotalAmountOfCashCollected { get; set; }

    // ── Service revenue ──────────────────────────────────────────────────────
    /// <summary>
    /// Sum of CompanyServicePrice across all delivered orders for the day.
    /// This is the gross delivery fee revenue the company earned.
    /// </summary>
    public decimal TotalCompanyServiceRevenue { get; set; } = 0;

    // ── Courier salary ───────────────────────────────────────────────────────
    /// <summary>
    /// Total salary earned by the courier for this day's deliveries.
    /// Sum of CourierSalary across all delivered orders.
    /// </summary>
    public decimal TotalCourierSalary { get; set; } = 0;

    // ── Transfer & net ───────────────────────────────────────────────────────
    /// <summary>
    /// How much cash the courier must physically hand over to the company.
    /// = TotalAmountOfCashCollected - TotalCourierSalary
    /// </summary>
    public decimal TotalCourierTransferToCompany { get; set; } = 0;

    /// <summary>
    /// Net income for the company after all flows are settled.
    /// = TotalCompanyServiceRevenue - TotalCourierSalary
    /// </summary>
    public decimal TotalCompanyNetIncome { get; set; } = 0;

    // ── Meta ─────────────────────────────────────────────────────────────────
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Set to true by admin when the day is formally closed.
    /// Once closed, no further changes should be made to this record.
    /// </summary>
    public bool IsTheDayClosed { get; set; } = false;

    // ── Payment tracking ─────────────────────────────────────────────────────

    /// <summary>
    /// Whether the company has paid this courier their salary for this settlement.
    /// When admin marks this true, a PaymentRequest of type CompanyPaysCourier is created.
    /// </summary>
    public bool WasCourierPaid { get; set; } = false;

    /// <summary>Timestamp when admin marked the courier salary as paid.</summary>
    public DateTime? CourierPaidAt { get; set; }

    /// <summary>
    /// Whether the courier has handed over the collected cash to the company.
    /// When admin marks this true, a PaymentRequest of type CourierHandsOverRevenue is created.
    /// </summary>
    public bool HasCourierHandedOverRevenue { get; set; } = false;

    /// <summary>Timestamp when courier handed over cash.</summary>
    public DateTime? RevenueHandedOverAt { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────
    public ICollection<PaymentRequest> PaymentRequests { get; set; } = new List<PaymentRequest>();
}
