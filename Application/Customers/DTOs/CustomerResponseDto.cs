namespace Application.Customers.DTOs;

/// <summary>
/// Read-side projection of a Customer.
/// Returned by queries and by GET /api/customers/me.
/// Field names intentionally mirror SenderSection props so the frontend
/// can spread this directly into the sender form state.
/// </summary>
public sealed record CustomerResponseDto(
    Guid     Id,

    // Personal (mirrors SenderSection personal block)
    string   FirstName,
    string   LastName,
    string?  IdNumber,
    string   BusinessName,
    string   PhoneNumber,

    // Pickup address (mirrors SenderSection pickup block)
    string   City,
    string   District,
    string   Address,

    // Account meta
    string   Username,
    bool     IsActive,
    DateTime CreatedAt
);
