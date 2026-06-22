namespace Application.Operators.DTOs;

/// <summary>
/// Read DTO for an Operator — a back-office staff member with partial admin
/// access (Overview + Pick-Up accept). An Operator is just an ApplicationUser
/// with Role == "Operator"; there is no separate domain entity.
/// </summary>
public sealed record OperatorDto(
    string Id,
    string FirstName,
    string LastName,
    string Username,
    string? Email
);
