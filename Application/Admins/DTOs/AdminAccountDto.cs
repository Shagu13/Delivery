namespace Application.Admins.DTOs;

/// <summary>
/// Read DTO for an Admin-role account other than the system admin. An Admin is just an
/// ApplicationUser with Role == "Admin"; there is no separate domain entity.
/// </summary>
public sealed record AdminAccountDto(
    string Id,
    string FirstName,
    string LastName,
    string Username,
    string? Email
);
