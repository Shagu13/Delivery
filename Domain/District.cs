namespace Domain;

/// <summary>
/// Reference list of districts belonging to a City, seeded by the project owner.
/// Used in customer registration and order form drop-downs.
/// Soft-deleted via DateDeleted (null = active).
/// </summary>
public class District
{
    public Guid     Id               { get; set; } = Guid.NewGuid();

    /// <summary>Latin/English name — used as the canonical DB value in orders.</summary>
    public required string DistrictName     { get; set; }

    /// <summary>Georgian script name — used for display when language = "ka".</summary>
    public string?  DistrictNameGeo  { get; set; }

    public Guid     CityId           { get; set; }
    public City     City             { get; set; } = null!;

    /// <summary>
    /// Default company service price charged for deliveries to this district.
    /// Null means no default is set — admin must enter manually per order.
    /// </summary>
    public decimal? CompanyServicePrice { get; set; }

    /// <summary>
    /// True when this district belongs to the capital city (e.g. Tbilisi).
    /// Drives the CompanyServiceCapitalPrice tier during order pricing.
    /// Cannot be true at the same time as IsCityTerritory.
    /// </summary>
    public bool IsCapitalTerritory { get; set; } = false;

    /// <summary>
    /// True when this district belongs to a non-capital city centre.
    /// Drives the CompanyServiceCityPrice tier during order pricing.
    /// Cannot be true at the same time as IsCapitalTerritory.
    /// </summary>
    public bool IsCityTerritory { get; set; } = false;

    public DateTime  CreatedAt       { get; set; } = CustomTime.Now;
    public DateTime? DateDeleted     { get; set; }
}
