namespace Domain;

/// <summary>
/// Reference list of districts belonging to a City, seeded by the project owner.
/// Used in customer registration and order form drop-downs.
/// Soft-deleted via DateDeleted (null = active).
/// </summary>
public class District
{
    public Guid     Id             { get; set; } = Guid.NewGuid();
    public required string DistrictName   { get; set; }
    public Guid     CityId         { get; set; }
    public City     City           { get; set; } = null!;
    /// <summary>
    /// Default company service price charged for deliveries to this district.
    /// Null means no default is set — admin must enter manually per order.
    /// </summary>
    public decimal? CompanyServicePrice { get; set; }

    public DateTime CreatedAt      { get; set; } = DateTime.UtcNow;
    public DateTime? DateDeleted   { get; set; }
}
