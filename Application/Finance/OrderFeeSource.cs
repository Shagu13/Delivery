namespace Application.Finance;

/// <summary>Which rung of the company-service-fee waterfall produced a resolved fee.</summary>
public enum OrderFeeSource
{
    /// <summary>No price could be resolved — the admin must enter one.</summary>
    None = 0,
    WeightTier = 1,
    /// <summary>The customer has a per-district special price for this order's delivery district.</summary>
    CustomerSpecialPrice = 2,
    /// <summary>The customer's negotiated capital / city / district rate.</summary>
    CustomerNegotiatedRate = 3,
    DistrictDefault = 4,
}
