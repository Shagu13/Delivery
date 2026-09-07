namespace Domain;

/// <summary>
/// Represents a registered customer (sender/business) who can log in, place shipments,
/// and track their own packages.
///
/// The sender-info fields (BusinessName, PhoneNumber, City, District, Address)
/// are pre-filled into SenderSection when the customer creates a GroupOrder.
/// </summary>
public class Customer
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // ── Personal information (→ SenderSection) ───────────────────────────────
    public required string FirstName    { get; set; }   // → SenderFirstName
    public required string LastName     { get; set; }   // → SenderLastName
    public string?         IdNumber     { get; set; }   // → SenderIdNumber (optional)
    public required string BusinessName { get; set; }   // → SenderBusinessName
    public required string PhoneNumber  { get; set; }   // → SenderPhone

    // ── Default pick-up address (→ SenderSection pickup block) ───────────────
    public required string City     { get; set; }       // → PickUpCity
    public required string District { get; set; }       // → PickUpDistrict
    public required string Address  { get; set; }       // → PickUpAddress

    /// <summary>
    /// Exact coordinates of the pick-up address, captured when the customer (or an admin)
    /// dropped a pin on the map during registration / profile editing. Null when the
    /// address was only typed. Copied onto <see cref="GroupOrder.PickUpLatitude"/> when
    /// the customer places an order, so the pickup courier gets an exact pin.
    /// </summary>
    public double? Latitude  { get; set; }
    public double? Longitude { get; set; }

    // ── Pricing (admin-only) ─────────────────────────────────────────────────
    /// <summary>
    /// Negotiated per-package price for deliveries within Tbilisi (capital).
    /// Null / 0 → fall back to the district's default rate.
    /// </summary>
    public decimal? CompanyServiceCapitalPrice { get; set; }

    /// <summary>
    /// Negotiated per-package price for deliveries to non-Tbilisi cities.
    /// Null / 0 → fall back to the district's default rate.
    /// </summary>
    public decimal? CompanyServiceCityPrice { get; set; }

    /// <summary>
    /// Negotiated per-package price for deliveries to districts / villages
    /// that are not matched to a known city in the database.
    /// Null / 0 → fall back to the district's default rate.
    /// </summary>
    public decimal? CompanyServiceDistrictPrice { get; set; }

    /// <summary>
    /// When true, every order this customer places treats the entered package price as the
    /// all-in amount (product + company service fee). The fee is deducted in the background,
    /// so the per-order "service included" checkbox is forced on and hidden for this customer.
    /// </summary>
    public bool IsCompanyServicePriceIncludedInPrice { get; set; } = false;

    // ── Account status ───────────────────────────────────────────────────────
    public bool     IsActive  { get; set; } = true;
    public DateTime CreatedAt { get; set; } = CustomTime.Now;

    // ── White-label tenant ───────────────────────────────────────────────────
    /// <summary>
    /// The white-label brand this customer registered under (e.g. livo.ge), matched
    /// from the request host at registration. Null = root brand (dilo.ge). Drives
    /// co-admin data scoping: a TenantAdmin sees only customers with their TenantId.
    /// </summary>
    public Guid?   TenantId { get; set; }
    public Tenant? Tenant   { get; set; }

    // ── Identity link ────────────────────────────────────────────────────────
    /// <summary>
    /// The backing login account. Null for a customer an admin registered at the office
    /// (walk-in) who has no account yet — see the office "Add Package" flow. When such a
    /// person later registers, the new login is linked to this same row (matched on
    /// PhoneNumber + IdNumber) rather than creating a duplicate.
    /// </summary>
    public string?          ApplicationUserId { get; set; }
    public ApplicationUser?  ApplicationUser   { get; set; }

    // ── Per-district negotiated price exceptions ─────────────────────────────
    /// <summary>
    /// Sparse per-district price overrides on top of the capital/city/district tiers above
    /// (e.g. a special rate for Rustavi specifically). See <see cref="CustomerSpecialPrice"/>.
    /// </summary>
    public ICollection<CustomerSpecialPrice> SpecialPrices { get; set; } = new List<CustomerSpecialPrice>();

    // ── Saved pickup addresses beyond the main one above ─────────────────────
    /// <summary>Capped at 5 — see <see cref="CustomerSecondaryAddress"/>.</summary>
    public ICollection<CustomerSecondaryAddress> SecondaryAddresses { get; set; } = new List<CustomerSecondaryAddress>();

    // ── Saved bank accounts for payout lookup ────────────────────────────────
    /// <summary>Capped at 5 — see <see cref="CustomerBankAccount"/>.</summary>
    public ICollection<CustomerBankAccount> BankAccounts { get; set; } = new List<CustomerBankAccount>();
}
