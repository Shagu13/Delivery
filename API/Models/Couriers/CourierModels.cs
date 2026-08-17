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
    string Password,
    decimal? DefaultSalary = null
);

/// <summary>HTTP response body — returns the new courier's domain ID.</summary>
public sealed record CreateCourierResponse(
    Guid CourierId,
    string Username,
    string FullName
);

/// <summary>HTTP request body for PUT /api/couriers/{id} (admin only).</summary>
public sealed record UpdateCourierRequest(
    string   FirstName,
    string   LastName,
    string   Username,
    string?  NewPassword,
    string   PhoneNumber,
    string   IdNumber,
    decimal? DefaultSalary = null
);

/// <summary>HTTP request body for PATCH /api/couriers/{id}/active (admin only).</summary>
public sealed record SetCourierActiveStatusRequest(bool IsActive);
