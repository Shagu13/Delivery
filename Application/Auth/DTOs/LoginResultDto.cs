namespace Application.Auth.DTOs
{
    public sealed record LoginResultDto(
        string  Token,
        string  Username,
        string  FirstName,
        string  LastName,
        string  Role,
        DateTime ExpiresAt,
        Guid?   CustomerId = null,  // ← included when role is Customer
        Guid?   TenantId   = null   // ← included for TenantAdmin, or a tenant-owned Customer
    );
}
