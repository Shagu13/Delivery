namespace Domain;

/// <summary>
/// Represents a registered customer who can log in, place shipments,
/// and track their own packages.
///
/// The sender-info fields (BusinessName, PhoneNumber, City, District, Address)
/// are pre-filled into SenderSection when the customer creates a GroupOrder —
/// matching exactly the fields from GroupOrder.SenderX / PickUpX.
/// </summary>
public class Customer
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // ── Personal information (→ SenderSection) ───────────────────────────────
    public required string FirstName    { get; set; }     // → SenderFirstName
    public required string LastName     { get; set; }     // → SenderLastName
    public string?         IdNumber     { get; set; }     // → SenderIdNumber (optional)
    public required string BusinessName { get; set; }     // → SenderBusinessName
    public required string PhoneNumber  { get; set; }     // → SenderPhone

    // ── Default pickup address (→ SenderSection pickup block) ────────────────
    public required string City     { get; set; }         // → PickUpCity
    public required string District { get; set; }         // → PickUpDistrict
    public required string Address  { get; set; }         // → PickUpAddress

    // ── Account status ───────────────────────────────────────────────────────
    public bool     IsActive  { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ── Identity link ────────────────────────────────────────────────────────
    public required string ApplicationUserId { get; set; }
    public ApplicationUser ApplicationUser   { get; set; } = null!;
}
