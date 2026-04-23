namespace Application.Customers.DTOs;

/// <summary>
/// Input DTO for creating a Customer along with their login credentials.
/// All sender-info fields map directly onto SenderSection in the UI and
/// are later used to pre-fill GroupOrder creation.
/// </summary>
public sealed record CreateCustomerDto(
    // Personal
    string  FirstName,
    string  LastName,
    string? IdNumber,       // optional
    string  BusinessName,
    string  PhoneNumber,

    // Default pickup address
    string City,
    string District,
    string Address,

    // Login
    string Username,
    string Password
);
