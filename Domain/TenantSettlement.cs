namespace Domain;

/// <summary>
/// Monthly financial settlement between the company (dilo) and a white-label <see cref="Tenant"/>
/// (e.g. livo). One record per Tenant per calendar month (<see cref="Year"/> + <see cref="Month"/>).
///
/// The tenant is a full intermediary: dilo's couriers physically collect COD and fees, so two
/// opposite money flows accrue between dilo and the tenant:
///   • COD dilo collected for the tenant's customers' packages — <b>dilo owes the tenant</b>.
///   • Sender-paid company service fees for the tenant's deliveries — <b>tenant owes dilo</b>.
///
/// The aggregate figures are auto-computed from the month's orders (those whose owning customer
/// carries this TenantId) and refreshed on recompute. Payment figures accumulate: the plain field
/// holds the most recent payment, the Total* field the running sum.
///
/// The tenant↔dilo tier, one level up from the company↔customer per-order settlement. No
/// markup in v1 → the same <c>Order.CompanyServicePrice</c> drives both the tenant↔dilo and
/// tenant↔sub-customer tiers.
/// </summary>
public class TenantSettlement
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // ── Tenant link ──────────────────────────────────────────────────────────
    public Guid   TenantId { get; set; }
    public Tenant Tenant   { get; set; } = null!;

    // ── Period ───────────────────────────────────────────────────────────────
    public int Year  { get; set; }
    public int Month { get; set; }   // 1–12

    // ── Auto-computed from the month's orders (customers with this TenantId) ──
    /// <summary>Number of the tenant's orders placed in the month (active, non-cancelled).</summary>
    public int TotalNumberOfOrdersPlaced { get; set; } = 0;

    /// <summary>Number of the tenant's orders delivered in the month.</summary>
    public int TotalNumberOfOrderDelivered { get; set; } = 0;

    /// <summary>
    /// Total package COD dilo collected for the tenant's customers' packages this month.
    /// Dilo physically holds this cash and owes it to the tenant.
    /// </summary>
    public decimal TotalCODCompanyCollectedForTenant { get; set; } = 0;

    /// <summary>
    /// Total sender-paid company service fees for the tenant's deliveries this month.
    /// The tenant owes this to dilo (dilo performed the deliveries).
    /// </summary>
    public decimal TotalCompanyServicePriceOwedByTenant { get; set; } = 0;

    // ── COD payments: dilo → tenant (accumulating) ───────────────────────────
    /// <summary>Running total of collected COD dilo has paid out to the tenant.</summary>
    public decimal TotalAmountOfCollectedCodPaidToTenant { get; set; } = 0;

    /// <summary>The most recent COD payment amount dilo recorded for the tenant.</summary>
    public decimal AmountOfCollectedCodPaidToTenant { get; set; } = 0;

    // ── Service payments: tenant → dilo (accumulating) ───────────────────────
    /// <summary>Running total the tenant has paid dilo for service fees.</summary>
    public decimal TotalAmountPaidToCompanyForCompanyService { get; set; } = 0;

    /// <summary>The most recent service-fee payment amount the tenant recorded.</summary>
    public decimal AmountPaidToCompanyForCompanyService { get; set; } = 0;

    // ── Meta ─────────────────────────────────────────────────────────────────
    public DateTime  CreatedAt { get; set; } = CustomTime.Now;

    /// <summary>When the record was last recomputed or had a payment recorded. Null until first update.</summary>
    public DateTime? UpdatedAt { get; set; }
}
