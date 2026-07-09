namespace Application.Couriers.DTOs;

/// <summary>
/// Input DTO for creating a Courier with their login credentials.
/// Username and Password are used to create the backing ApplicationUser.
/// </summary>
public sealed record CreateCourierDto(
    string FirstName,
    string LastName,
    string IdNumber,
    string PhoneNumber,
    string AssignedCity,
    string AssignedDistrict,
    string Username,
    string Password,
    /// <summary>Standard per-order salary — only allowed when AssignedCity is Tbilisi.</summary>
    decimal? DefaultSalary = null
);
