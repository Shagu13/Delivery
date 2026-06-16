using System.ComponentModel.DataAnnotations;

namespace API.Models.Customers;

// ── Self-registration ─────────────────────────────────────────────────────────
public sealed record RegisterCustomerRequest(
    [Required][MaxLength(100)]  string  FirstName,
    [Required][MaxLength(100)]  string  LastName,
    [MaxLength(50)]             string? IdNumber,
    [Required][MaxLength(150)]  string  BusinessName,
    [Required][MaxLength(20)]   string  PhoneNumber,
    [Required][MaxLength(100)]  string  City,
    [Required][MaxLength(100)]  string  District,
    [Required][MaxLength(250)]  string  Address,
    [Required][EmailAddress][MaxLength(256)] string Email,
    [Required][MinLength(8)][MaxLength(100)] string Password,
    [Required]                              string ConfirmPassword
);

// ── Admin-created ─────────────────────────────────────────────────────────────
public sealed record CreateCustomerRequest(
    [Required][MaxLength(100)]  string  FirstName,
    [Required][MaxLength(100)]  string  LastName,
    [MaxLength(50)]             string? IdNumber,
    [Required][MaxLength(150)]  string  BusinessName,
    [Required][MaxLength(20)]   string  PhoneNumber,
    [Required][MaxLength(100)]  string  City,
    [Required][MaxLength(100)]  string  District,
    [Required][MaxLength(250)]  string  Address,
    [Required][EmailAddress][MaxLength(256)] string Email,
    [Required][MinLength(8)][MaxLength(100)] string Password,
    bool IsCompanyServicePriceIncludedInPrice = false
);

// ── Profile update ────────────────────────────────────────────────────────────
public sealed record UpdateCustomerRequest(
    [Required][MaxLength(100)]  string  FirstName,
    [Required][MaxLength(100)]  string  LastName,
    [MaxLength(50)]             string? IdNumber,
    [Required][MaxLength(150)]  string  BusinessName,
    [Required][MaxLength(20)]   string  PhoneNumber,
    [Required][MaxLength(100)]  string  City,
    [Required][MaxLength(100)]  string  District,
    [Required][MaxLength(250)]  string  Address
);

// ── Change password ───────────────────────────────────────────────────────────
public sealed record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required][MinLength(8)][MaxLength(100)] string NewPassword,
    [Required] string ConfirmNewPassword
);

// ── Admin: set a customer's password (no current password required) ─────────────
public sealed record AdminSetPasswordRequest(
    [Required][MinLength(8)][MaxLength(100)] string NewPassword,
    [Required] string ConfirmNewPassword
);

// ── Admin: soft-delete / activate a customer ────────────────────────────────────
public sealed record SetCustomerActiveRequest(bool IsActive);

// ── Responses ─────────────────────────────────────────────────────────────────
public sealed record CreateCustomerResponse(Guid CustomerId, string Email, string FullName);

public sealed record CustomerListResponse(
    Guid Id, string FirstName, string LastName, string? IdNumber,
    string BusinessName, string PhoneNumber,
    string City, string District, string Address,
    string Email, bool IsActive, DateTime CreatedAt
);
