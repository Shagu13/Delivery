namespace Domain;

/// <summary>
/// Represents the end-of-day financial settlement for a single courier.
/// One record per courier per working day.
/// Once IsTheDayClosed is set to true the record is considered immutable.
///
/// Only stores immutable physical facts recorded at settlement time.
/// Stale snapshot fields (TotalCodOwedToSenders, TotalServiceFeesOwedBySenders,
/// CompanyNetCashAfterCod) were removed — those are derived live from Orders
/// so they never go stale.
/// </summary>
public class CourierSettlement
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

    /// <summary>
    /// Number of orders for this courier cancelled on this day
    /// (Status == CancelledByAdmin, attributed to the day by Order.CreatedAt).
    /// </summary>
    public int NumberOfOrdersCancelled { get; set; } = 0;

    /// <summary>
    /// Number of orders this courier postponed on this day
    /// (counted via Order.PostponedAt falling within the day, regardless of
    /// the order's current status — a postponed order may later be delivered).
    /// </summary>
    public int NumberOfOrderPostponed { get; set; } = 0;

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

    /// <summary>
    /// Sum of CompanyServicePrice for delivered orders where the recipient pays
    /// the service fee — i.e. the slice of service revenue the courier physically
    /// collected as cash at delivery (already inside TotalAmountOfCashCollected).
    /// The remainder (TotalCompanyServiceRevenue − this) is the sender-pays slice
    /// invoiced to customers and tracked as a receivable on CustomerSettlement.
    /// </summary>
    public decimal TotalCompanyServicePriceCollectedFromRecipient { get; set; } = 0;

    // ── Courier salary ───────────────────────────────────────────────────────
    /// <summary>
    /// Total salary earned by the courier for this day's deliveries.
    /// Sum of CourierSalary across all delivered orders.
    /// </summary>
    public decimal TotalCourierSalary { get; set; } = 0;

    /// <summary>
    /// Amount the courier was actually paid for this settlement.
    /// When the admin pays in full this equals TotalCourierSalary; when paying
    /// partly it is the amount the admin entered. Defaults to 0 until recorded.
    /// </summary>
    public decimal AmountCourierWasPaid { get; set; } = 0;

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
    public DateTime CreatedAt { get; set; } = CustomTime.Now;

    /// <summary>
    /// When the settlement was last recomputed/updated. Null until first update.
    /// </summary>
    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// Set to true by admin when the day is formally closed.
    /// Once closed, no further changes should be made to this record.
    /// </summary>
    public bool IsTheDayClosed { get; set; } = false;
}
