namespace Domain;

/// <summary>
/// A weight-range pricing tier defined by admins.
/// When an order's weight tier has IsStandard = false, the tier's CustomPrice
/// is used as the CompanyServicePrice regardless of delivery destination
/// (capital / city / district) or any customer-negotiated rate.
/// When IsStandard = true, CustomPrice is null and the existing pricing logic
/// (customer negotiated → district fallback) is used as normal.
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
    /// When true → use the customer's negotiated pricing (or district fallback) as normal.
    /// CustomPrice must be null.
    /// When false → override all pricing with CustomPrice, regardless of destination or customer tier.
    /// </summary>
    public bool IsStandard { get; set; } = true;

    /// <summary>
    /// Flat service price applied to every order in this weight range.
    /// Only used when IsStandard = false. Null when IsStandard = true.
    /// </summary>
    public decimal? CustomPrice { get; set; }

    public DateTime  CreatedAt   { get; set; } = DateTime.UtcNow;

    /// <summary>Soft-delete: non-null means the tier has been removed from active use.</summary>
    public DateTime? DateDeleted { get; set; }
}
