namespace Application.Customers.DTOs;

/// <summary>
/// Read-side projection of a Customer.
/// Email is the customer's login identifier (stored as both Email and UserName on ApplicationUser).
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
    string   Email,       // was Username — now the actual email address
    bool     IsActive,
    DateTime CreatedAt
);
