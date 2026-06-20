namespace Domain;

/// <summary>
/// Reference list of Georgian cities seeded by the project owner.
/// Used as the data source for city drop-downs in customer registration and order forms.
/// Soft-deleted via DateDeleted (null = active).
/// </summary>
public class City
{
    public Guid     Id           { get; set; } = Guid.NewGuid();

    /// <summary>Latin/English name — used as the canonical DB value in orders.</summary>
    public required string CityName     { get; set; }

    /// <summary>Georgian script name — used for display when language = "ka".</summary>
    public string?  CityNameGeo  { get; set; }

    public DateTime  CreatedAt   { get; set; } = CustomTime.Now;
    public DateTime? DateDeleted { get; set; }

    // Navigation
    public ICollection<District> Districts { get; set; } = new List<District>();
}
