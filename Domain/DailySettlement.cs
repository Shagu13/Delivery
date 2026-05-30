namespace Domain;

/// <summary>
/// Represents the end-of-day financial settlement for a single courier.
/// One record per courier per working day.
/// Once IsTheDayClosed is set to true the record is considered immutable.
///
/// Financial flow example (9 orders, 5 Recipient-payer, 4 Sender-payer):
///   TotalAmountOfCashCollected   = 340.50  (courier collected in cash)
///   TotalCodOwedToSenders        = 305.50  (product money belonging to senders)
///   TotalCompanyServiceRevenue   =  63.00  (9 × 7.00)
///   TotalServiceFeesOwedBySenders =  28.00 (4 × 7.00 — still to collect)
///   TotalCourierSalary           =  45.00
///   TotalCourierTransferToCompany= 295.50  (340.50 − 45.00)
///   CompanyNetCashAfterCod       = −10.00  (295.50 − 305.50, short until senders pay)
///   TotalCompanyNetIncome        =  18.00  (−10.00 + 28.00 = 63.00 − 45.00) ✓
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

    // ── COD flows ────────────────────────────────────────────────────────────
    /// <summary>
    /// Total product money (COD) the company must forward back to senders.
    /// = sum of AmountToCollectForPackage across all delivered orders with COD.
    /// This cash belongs to senders, not the company — it passes through.
    /// </summary>
    public decimal TotalCodOwedToSenders { get; set; } = 0;

    // ── Service revenue ──────────────────────────────────────────────────────
    /// <summary>
    /// Sum of CompanyServicePrice across all delivered orders for the day.
    /// This is the gross delivery fee revenue the company earned.
    /// </summary>
    public decimal TotalCompanyServiceRevenue { get; set; } = 0;

    /// <summary>
    /// Service fees still owed to the company by senders (WhoPaysForCompanyService == Sender).
    /// These orders' fees were not collected in cash — senders must pay separately.
    /// Until collected, the company is cash-short by this amount minus CompanyNetCashAfterCod.
    /// </summary>
    public decimal TotalServiceFeesOwedBySenders { get; set; } = 0;

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
    /// The courier keeps their salary from the cash they collected and hands the rest over.
    /// </summary>
    public decimal TotalCourierTransferToCompany { get; set; } = 0;

    /// <summary>
    /// Company's cash position after receiving the courier handover and paying all COD to senders.
    /// = TotalCourierTransferToCompany - TotalCodOwedToSenders
    /// Can be negative: means the company pays out more COD than it received from the courier,
    /// because some service fees were collected by the courier for Recipient-payer orders
    /// while Sender-payer orders' fees are not yet received.
    /// Once TotalServiceFeesOwedBySenders is collected, net becomes TotalCompanyNetIncome.
    /// Invariant: CompanyNetCashAfterCod + TotalServiceFeesOwedBySenders = TotalCompanyNetIncome
    /// </summary>
    public decimal CompanyNetCashAfterCod { get; set; } = 0;

    /// <summary>
    /// Net income for the company after all flows are settled.
    /// = TotalCompanyServiceRevenue - TotalCourierSalary
    /// Also equals: CompanyNetCashAfterCod + TotalServiceFeesOwedBySenders
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
