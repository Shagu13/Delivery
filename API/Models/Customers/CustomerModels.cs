using System.ComponentModel.DataAnnotations;

namespace API.Models.Customers;

// ── Requests ─────────────────────────────────────────────────────────────────

public sealed record CreateCustomerRequest(
    // Personal
    [Required][MaxLength(100)]  string  FirstName,
    [Required][MaxLength(100)]  string  LastName,
    [MaxLength(50)]             string? IdNumber,      // optional
    [Required][MaxLength(150)]  string  BusinessName,
    [Required][MaxLength(20)]   string  PhoneNumber,

    // Default pickup address
    [Required][MaxLength(100)]  string  City,
    [Required][MaxLength(100)]  string  District,
    [Required][MaxLength(250)]  string  Address,

    // Login
    [Required][MaxLength(50)]   string  Username,
    [Required][MinLength(8)][MaxLength(100)] string Password
);

// ── Responses ────────────────────────────────────────────────────────────────

public sealed record CreateCustomerResponse(
    Guid   CustomerId,
    string Username,
    string FullName
);

/// <summary>
/// Returned by GET /api/customers and GET /api/customers/{id} and GET /api/customers/me.
/// Field names intentionally mirror SenderSection props for direct form pre-fill.
/// </summary>
public sealed record CustomerListResponse(
    Guid     Id,
    string   FirstName,
    string   LastName,
    string?  IdNumber,
    string   BusinessName,
    string   PhoneNumber,
    string   City,
    string   District,
    string   Address,
    string   Username,
    bool     IsActive,
    DateTime CreatedAt
);
