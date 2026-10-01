namespace Domain;

/// <summary>
/// One user's saved parcel-label print settings (last chosen size, custom width/height, logo
/// position per size), so they follow the user across browsers and devices. At most one row per
/// <see cref="OwnerUserId"/>; saving upserts it. Admin, operator and customer each design their own.
/// </summary>
public class LabelDesign
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The owning <c>ApplicationUser.Id</c> (from the JWT, never from a request body).</summary>
    public required string OwnerUserId { get; set; }

    /// <summary>The label window's preferences as JSON. The client owns the shape (it holds per-size
    /// logo positions, which would need a dozen columns); the server only checks it is valid JSON of
    /// bounded size — same approach as <see cref="Tenant.HomepageJson"/>.</summary>
    public required string PrefsJson { get; set; }

    public DateTime UpdatedAt { get; set; } = CustomTime.Now;
}
