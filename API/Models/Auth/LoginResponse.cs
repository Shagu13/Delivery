namespace API.Models.Auth
{
    public sealed record LoginResponse(
        string   Token,
        string   Username,
        string   FirstName,
        string   LastName,
        string   Role,
        DateTime ExpiresAt,
        Guid?    CustomerId = null,
        Guid?    TenantId   = null
    );
}
