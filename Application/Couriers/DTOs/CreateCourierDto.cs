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
    /// <summary>Per-zone delivery salaries — see Courier.CapitalSalary/CitySalary/DistrictSalary; null = no auto-fill.</summary>
    decimal? CapitalSalary = null,
    decimal? CitySalary = null,
    decimal? DistrictSalary = null
);
