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

    // ── Account status ───────────────────────────────────────────────────────
    public bool     IsActive  { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ── Identity link ────────────────────────────────────────────────────────
    public required string ApplicationUserId { get; set; }
    public ApplicationUser ApplicationUser   { get; set; } = null!;
}
