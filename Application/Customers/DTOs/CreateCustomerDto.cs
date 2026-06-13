namespace Application.Customers.DTOs;

/// <summary>
/// Input DTO for creating a Customer.
/// Email is used as both the login username (UserName) and the Identity email.
/// ConfirmPassword is validated at the API/command level; only Password reaches the handler.
/// </summary>
public sealed record CreateCustomerDto(
    // Personal
    string  FirstName,
    string  LastName,
    string? IdNumber,
    string  BusinessName,
    string  PhoneNumber,

    // Default pickup address
    string City,
    string District,
    string Address,

    // Login — Email becomes UserName in Identity
    string Email,
    string Password,

    /// <summary>When true, this customer's package prices are all-in (service fee deducted in background).</summary>
    bool IsCompanyServicePriceIncludedInPrice = false
);
