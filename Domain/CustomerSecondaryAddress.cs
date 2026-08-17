namespace Domain;

/// <summary>
/// One of a customer's saved pickup addresses beyond their main one (<see cref="Customer.City"/>
/// / <see cref="Customer.District"/> / <see cref="Customer.Address"/>). Self-managed by the
/// customer from their profile; offered as a pickup-location choice when creating a GroupOrder,
/// alongside the main address (the default). Capped at 5 per customer — see
/// AddCustomerSecondaryAddressCommand.
/// </summary>
public class CustomerSecondaryAddress
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid     CustomerId { get; set; }
    public Customer Customer   { get; set; } = null!;

    /// <summary>Short customer-chosen name so saved addresses are distinguishable in the picker
    /// (e.g. "Warehouse", "Store 2").</summary>
    public required string Label    { get; set; }
    public required string City     { get; set; }
    public required string District { get; set; }
    public required string Address  { get; set; }

    public DateTime CreatedAt { get; set; } = CustomTime.Now;
}
