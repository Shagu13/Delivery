namespace Application.Customers.DTOs;

/// <summary>
/// Admin-only view of a Customer. Extends the base fields with the negotiated
/// company delivery price which must not be exposed to the customer themselves.
/// </summary>
public sealed record AdminCustomerResponseDto(
    Guid     Id,
    string   FirstName,
    string   LastName,
    string?  IdNumber,
    string   BusinessName,
    string   PhoneNumber,
    string   City,
    string   District,
    string   Address,
    string   Email,
    bool     IsActive,
    DateTime CreatedAt,
    // Admin-only pricing tiers
    decimal? CompanyServiceCapitalPrice,
    decimal? CompanyServiceCityPrice,
    decimal? CompanyServiceDistrictPrice,
    /// <summary>When true, this customer's package prices are all-in (service fee deducted in the background).</summary>
    bool     IsCompanyServicePriceIncludedInPrice
);
