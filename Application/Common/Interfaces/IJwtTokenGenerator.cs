using Domain;

namespace Application.Common.Interfaces;

public interface IJwtTokenGenerator
{
    string GenerateToken(
        ApplicationUser user,
        string          role,
        Guid?           courierId  = null,
        Guid?           customerId = null,
        Guid?           tenantId   = null,
        int?            expiryMinutesOverride = null);
}
