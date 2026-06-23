using Application.Common.Interfaces;
using Domain;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Infrastructure.Services;

public sealed class JwtTokenGenerator : IJwtTokenGenerator
{
    private readonly JwtSettings _settings;

    public JwtTokenGenerator(IOptions<JwtSettings> options) => _settings = options.Value;

    public string GenerateToken(
        ApplicationUser user,
        string          role,
        Guid?           courierId  = null,
        Guid?           customerId = null,
        Guid?           tenantId   = null)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub,  user.Id),
            new(JwtRegisteredClaimNames.Jti,  Guid.NewGuid().ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email ?? ""),
            new(ClaimTypes.NameIdentifier,    user.Id),
            new(ClaimTypes.Name,              user.UserName ?? user.Id),
            new(ClaimTypes.Role,              role),
            new("firstName",                  user.FirstName),
            new("lastName",                   user.LastName),
        };

        if (courierId.HasValue)
            claims.Add(new Claim("courierId",  courierId.Value.ToString()));

        if (customerId.HasValue)
            claims.Add(new Claim("customerId", customerId.Value.ToString()));

        // The white-label tenant this principal is scoped to (TenantAdmin co-admin, or a
        // tenant-owned Customer). Absent for root admins and root (dilo) customers.
        if (tenantId.HasValue)
            claims.Add(new Claim("tenantId", tenantId.Value.ToString()));

        var key         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_settings.Secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer:             _settings.Issuer,
            audience:           _settings.Audience,
            claims:             claims,
            notBefore:          DateTime.UtcNow,
            expires:            DateTime.UtcNow.AddMinutes(_settings.ExpiryMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
