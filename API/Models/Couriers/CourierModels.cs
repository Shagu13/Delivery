namespace API.Models.Couriers;

/// <summary>HTTP request body for POST /api/couriers (admin only).</summary>
public sealed record CreateCourierRequest(
    string FirstName,
    string LastName,
    string IdNumber,
    string PhoneNumber,
    string AssignedCity,
    string AssignedDistrict,
    string Username,
    string Password
);

/// <summary>HTTP response body — returns the new courier's domain ID.</summary>
public sealed record CreateCourierResponse(
    Guid CourierId,
    string Username,
    string FullName
);
