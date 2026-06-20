namespace Domain;

/// <summary>
/// Per-batch financial invoice between the company and a single customer (sender).
/// One record per GroupOrder (Send/Exchange batch) OR per standalone Return order —
/// exactly one of <see cref="GroupOrderId"/> / <see cref="OrderId"/> is set.
///
/// Created automatically when the customer places the batch and recomputed as its
/// orders are delivered, edited or cancelled. Soft-deleted (<see cref="DateDeleted"/>)
/// when the whole batch is cancelled.
///
/// Two opposite money flows are tracked:
///   • COD the company collects for the customer's packages (company owes customer).
///   • Company service fees the customer owes the company (customer owes company).
///
/// The four aggregate figures are auto-computed from the batch's active (non-cancelled)
/// orders and refreshed on every recompute. The payment figures are entered by admin and
/// accumulate over time: the plain field holds the most recent payment, the Total* field
/// the running sum.
/// </summary>
public class CustomerSettlement
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // ── Batch link — exactly one of the two is set ───────────────────────────
    /// <summary>The Send/Exchange batch this invoice covers. Null for standalone Returns.</summary>
    public Guid?       GroupOrderId { get; set; }
    public GroupOrder? GroupOrder   { get; set; }

    /// <summary>The standalone Return order this invoice covers. Null for batches.</summary>
    public Guid?  OrderId { get; set; }
    public Order? Order   { get; set; }

    // ── Customer link ────────────────────────────────────────────────────────
    public Guid CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;

    // ── Auto-computed from the batch's active orders ─────────────────────────
    /// <summary>Number of active (non-cancelled) orders in the batch.</summary>
    public int TotalNumberOfOrdersPlaced { get; set; } = 0;

    /// <summary>Number of the batch's orders delivered (terminal-delivered statuses).</summary>
    public int TotalNumberOfOrderDelivered { get; set; } = 0;

    /// <summary>
    /// Total package COD across the batch's active orders (Σ AmountToCollectForPackage).
    /// The company collects this on the customer's behalf and owes it back to them.
    /// </summary>
    public decimal TotalCODCompanyCollectedForPackages { get; set; } = 0;

    /// <summary>
    /// Total company service fees the customer owes the company for the batch
    /// (Σ CompanyServicePrice on active orders where the sender pays the fee).
    /// </summary>
    public decimal TotalCompanyServicePriceOwedToCompany { get; set; } = 0;

    // ── COD payments: company → customer (accumulating) ──────────────────────
    /// <summary>Running total of collected COD the company has paid back to the customer.</summary>
    public decimal TotalAmountOfCollectedCodPaidByCompany { get; set; } = 0;

    /// <summary>The most recent COD payment amount the company recorded for this customer.</summary>
    public decimal AmountOfCollectedCodPaidByCompany { get; set; } = 0;

    // ── Service payments: customer → company (accumulating) ──────────────────
    /// <summary>Running total the customer has paid the company for service fees.</summary>
    public decimal TotalAmountPaidToCompanyForCompanyService { get; set; } = 0;

    /// <summary>The most recent service-fee payment amount the customer recorded.</summary>
    public decimal AmountPaidToCompanyForCompanyService { get; set; } = 0;

    // ── Meta ─────────────────────────────────────────────────────────────────
    /// <summary>The batch's placement date (copied from GroupOrder/Order CreatedAt).</summary>
    public DateTime CreatedAt { get; set; } = CustomTime.Now;

    /// <summary>When the invoice was last recomputed or had a payment recorded. Null until first update.</summary>
    public DateTime? UpdatedAt { get; set; }

    /// <summary>Set when the whole batch is cancelled. Non-deleted rows have this null.</summary>
    public DateTime? DateDeleted { get; set; }
}
