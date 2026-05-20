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
    string   Email,
    bool     IsActive,
    DateTime CreatedAt,
    // Negotiated company service pricing tiers (null = use district default)
    decimal? CompanyServiceCapitalPrice,
    decimal? CompanyServiceCityPrice,
    decimal? CompanyServiceDistrictPrice
);
