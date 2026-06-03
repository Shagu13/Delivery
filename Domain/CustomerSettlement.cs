namespace Domain;

/// <summary>
/// Monthly financial settlement between the company and a single customer (sender).
/// One record per customer per calendar month (identified by Year + Month).
///
/// Two opposite money flows are tracked:
///   • COD the company collected for the customer's packages (company owes customer).
///   • Company service fees the customer owes the company (customer owes company).
///
/// The four aggregate figures (orders placed/delivered, COD collected, service owed)
/// are auto-computed from the customer's orders for the month and refreshed on
/// recompute. The payment figures are entered by admin and accumulate over time:
/// the plain field holds the most recent payment, the Total* field the running sum.
/// </summary>
public class CustomerSettlement
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // ── Period (monthly) ─────────────────────────────────────────────────────
    public int Year  { get; set; }
    public int Month { get; set; }   // 1–12

    // ── Customer link ────────────────────────────────────────────────────────
    public Guid CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;

    // ── Auto-computed from orders for the month ──────────────────────────────
    /// <summary>Number of orders the customer placed (created) during the month.</summary>
    public int TotalNumberOfOrdersPlaced { get; set; } = 0;

    /// <summary>Number of the customer's orders delivered during the month.</summary>
    public int TotalNumberOfOrderDelivered { get; set; } = 0;

    /// <summary>
    /// Total package COD the company collected on the customer's behalf for the
    /// month (Σ AmountToCollectForPackage on delivered orders). The company owes
    /// this back to the customer.
    /// </summary>
    public decimal TotalCODCompanyCollectedForPackages { get; set; } = 0;

    /// <summary>
    /// Total company service fees the customer owes the company for the month
    /// (Σ CompanyServicePrice on delivered orders where the sender pays the fee).
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
    public DateTime  CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>When the settlement was last recomputed or had a payment recorded. Null until first update.</summary>
    public DateTime? UpdatedAt { get; set; }
}
