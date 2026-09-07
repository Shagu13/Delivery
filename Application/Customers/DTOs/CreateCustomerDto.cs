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
    bool IsCompanyServicePriceIncludedInPrice = false,

    /// <summary>White-label tenant this customer belongs to. Null = root brand (dilo).</summary>
    Guid? TenantId = null,

    /// <summary>
    /// The host the customer registered on (self-registration only). When set and TenantId is
    /// null, the handler resolves it to an active tenant and stamps that — so a sign-up on
    /// livoexpress.ge auto-belongs to livo. Ignored when TenantId is supplied (admin path).
    /// </summary>
    string? RegistrationHost = null,

    /// <summary>Exact pick-up coordinates from a map pin drop. Null when the address was only typed.</summary>
    double? Latitude  = null,
    double? Longitude = null
);
