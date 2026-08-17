namespace Domain;

/// <summary>
/// A per-customer negotiated price override for one specific district — layered on top of
/// the customer's normal capital/city/district tiers (<see cref="Customer.CompanyServiceCapitalPrice"/>
/// and siblings). Used for cases like "this customer gets a special rate for Rustavi
/// specifically" without changing their city-tier rate for every other non-capital city.
///
/// A row here is a sparse exception, not a full price list: a customer with none behaves
/// exactly as before. When present, it wins over the capital/city/district tier for that one
/// district but still loses to an explicit per-order override and a weight-tier zone price —
/// see <c>GroupOrderOrderBuilder.ResolveStandardPrice</c>.
/// </summary>
public class CustomerSpecialPrice
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid     CustomerId { get; set; }
    public Customer Customer   { get; set; } = null!;

    public Guid     DistrictId { get; set; }
    public District District   { get; set; } = null!;

    public decimal  Price { get; set; }

    public DateTime CreatedAt { get; set; } = CustomTime.Now;
}
