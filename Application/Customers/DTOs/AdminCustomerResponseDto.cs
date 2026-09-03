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
    /// <summary>Login email. Empty string for a walk-in customer with no account yet.</summary>
    string   Email,
    /// <summary>False for a walk-in customer an admin registered at the office who has no login yet.</summary>
    bool     HasAccount,
    bool     IsActive,
    DateTime CreatedAt,
    // Admin-only pricing tiers
    decimal? CompanyServiceCapitalPrice,
    decimal? CompanyServiceCityPrice,
    decimal? CompanyServiceDistrictPrice,
    /// <summary>When true, this customer's package prices are all-in (service fee deducted in the background).</summary>
    bool     IsCompanyServicePriceIncludedInPrice,
    /// <summary>White-label tenant this customer belongs to. Null = root brand (dilo).</summary>
    Guid?    TenantId,
    /// <summary>Display name of the owning tenant, for the admin list/edit UI. Null when root.</summary>
    string?  TenantDisplayName
);
