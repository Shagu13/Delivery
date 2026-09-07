namespace Application.Customers.DTOs;

/// <summary>
/// Read-side projection of a Customer.
/// Email is the customer's login identifier (stored as both Email and UserName on ApplicationUser).
/// Includes the customer's negotiated company service pricing tiers so the sender
/// can preview delivery fees when creating a group order.
/// </summary>
public sealed record CustomerResponseDto(
    Guid     Id,
    string   FirstName,
    string   LastName,
    string?  IdNumber,
    string   BusinessName,
    string   PhoneNumber,
    string   City,
    string   District,
    string   Address,
    /// <summary>Exact pick-up coordinates from a saved map pin. Null when the address was only typed.</summary>
    double?  Latitude,
    double?  Longitude,
    string   Email,
    bool     IsActive,
    DateTime CreatedAt,
    // Negotiated company service pricing tiers (null = use district default)
    decimal? CompanyServiceCapitalPrice,
    decimal? CompanyServiceCityPrice,
    decimal? CompanyServiceDistrictPrice,
    /// <summary>When true, this customer's package prices are all-in; the per-order checkbox is forced on and hidden.</summary>
    bool     IsCompanyServicePriceIncludedInPrice,
    /// <summary>Per-district price exceptions on top of the tiers above (e.g. a special Rustavi rate).</summary>
    IReadOnlyList<CustomerSpecialPriceLite> SpecialPrices,
    /// <summary>Saved pickup addresses beyond the main one above (City/District/Address), capped
    /// at 5 — offered as a pickup-location choice when creating a GroupOrder.</summary>
    IReadOnlyList<CustomerSecondaryAddressDto> SecondaryAddresses,
    /// <summary>Saved bank accounts for payout lookup, capped at 5, default first.</summary>
    IReadOnlyList<CustomerBankAccountDto> BankAccounts
);
