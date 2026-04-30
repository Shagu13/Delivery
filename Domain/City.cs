namespace Domain;

/// <summary>
/// Reference list of Georgian cities seeded by the project owner.
/// Used as the data source for city drop-downs in customer registration and order forms.
/// Soft-deleted via DateDeleted (null = active).
/// </summary>
public class City
{
    public Guid     Id          { get; set; } = Guid.NewGuid();
    public required string CityName    { get; set; }
    public DateTime CreatedAt   { get; set; } = DateTime.UtcNow;
    public DateTime? DateDeleted { get; set; }

    // Navigation
    public ICollection<District> Districts { get; set; } = new List<District>();
}
