namespace Domain;

/// <summary>
/// A weight-range pricing tier defined by admins.
///
/// Each tier can carry up to three zone-specific prices that override the
/// normal pricing waterfall (customer-negotiated → district fallback):
///   • CapitalPrice  — applied when the recipient district has IsCapitalTerritory = true
///   • CityPrice     — applied when the recipient district has IsCityTerritory = true
///   • DistrictPrice — applied when neither flag is set (village / rural district)
///
/// A null price for a zone means "fall through to the normal pricing logic"
/// for that zone — so partial overrides are allowed.
/// </summary>
public class WeightPriceTier
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Optional display label, e.g. "Light", "Medium", "Heavy".
    /// Shown alongside the weight range in dropdowns.
    /// </summary>
    public string? Label { get; set; }

    /// <summary>Inclusive lower bound of the weight range in kilograms.</summary>
    public decimal MinWeightKg { get; set; }

    /// <summary>Inclusive upper bound of the weight range in kilograms.</summary>
    public decimal MaxWeightKg { get; set; }

    /// <summary>
    /// Override price for orders delivered to capital (Tbilisi) districts.
    /// Null → fall through to customer-negotiated capital price or district default.
    /// </summary>
    public decimal? CapitalPrice { get; set; }

    /// <summary>
    /// Override price for orders delivered to non-capital city districts.
    /// Null → fall through to customer-negotiated city price or district default.
    /// </summary>
    public decimal? CityPrice { get; set; }

    /// <summary>
    /// Override price for orders delivered to village / rural districts
    /// (districts where neither IsCapitalTerritory nor IsCityTerritory is set).
    /// Null → fall through to customer-negotiated district price or district default.
    /// </summary>
    public decimal? DistrictPrice { get; set; }

    public DateTime  CreatedAt  { get; set; } = DateTime.UtcNow;

    /// <summary>Soft-delete: non-null means the tier has been removed from active use.</summary>
    public DateTime? DateDeleted { get; set; }
}
