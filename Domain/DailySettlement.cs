namespace Domain;

/// <summary>
/// Represents the end-of-day financial settlement for a single courier.
/// One record per courier per working day.
/// Once IsTheDayClosed is set to true the record is considered immutable.
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
    /// Populated by summing <see cref="GroupOrder.NumberOfPackages"/> across all
    /// GroupOrders the courier picked up on this day.
    /// </summary>
    public int TotalOrdersPickedUp { get; set; } = 0;

    /// <summary>Number of orders successfully delivered to recipients on this day.</summary>
    public int TotalOrdersDelivered { get; set; } = 0;

    // ── Financials ───────────────────────────────────────────────────────────
    /// <summary>
    /// Total cash collected from recipients on behalf of the company (product payment).
    /// Null or 0 when no cash-on-delivery orders were handled that day.
    /// </summary>
    public decimal? TotalAmountOfCashCollected { get; set; }

    /// <summary>
    /// Sum of CompanyServicePrice across all delivered orders for the day.
    /// This is the gross revenue the company earned from courier service fees.
    /// </summary>
    public decimal TotalCompanyServiceRevenue { get; set; } = 0;

    /// <summary>
    /// Net income for the company after deducting the courier's salary.
    /// TotalCompanyServiceRevenue - TotalCourierSalary.
    /// </summary>
    public decimal TotalCompanyNetIncome { get; set; } = 0;

    /// <summary>
    /// Total salary paid out to the courier for this day's deliveries.
    /// Sum of CourierSalary across all delivered orders.
    /// </summary>
    public decimal TotalCourierSalary { get; set; } = 0;

    /// <summary>
    /// How much cash the courier must transfer to the company at end of day.
    /// TotalAmountOfCashCollected - TotalCourierSalary.
    /// The courier keeps their salary from the collected cash and hands over the rest.
    /// </summary>
    public decimal TotalCourierTransferToCompany { get; set; } = 0;

    // ── Meta ─────────────────────────────────────────────────────────────────
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Set to true by admin when the day is formally closed.
    /// Once closed, no further changes should be made to this record.
    /// </summary>
    public bool IsTheDayClosed { get; set; } = false;
}
