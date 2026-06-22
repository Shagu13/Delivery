namespace API.Models.Operators;

/// <summary>HTTP request body for POST /api/operators (admin only).</summary>
public sealed record CreateOperatorRequest(
    string FirstName,
    string LastName,
    string Username,
    string Password
);

/// <summary>HTTP response body — returns the new operator's user ID.</summary>
public sealed record CreateOperatorResponse(
    string Id,
    string Username,
    string FullName
);

/// <summary>HTTP request body for PUT /api/operators/{id} (admin only).</summary>
public sealed record UpdateOperatorRequest(
    string  FirstName,
    string  LastName,
    string  Username,
    string? NewPassword
);
