using System.Security.Claims;
using System.Text.Encodings.Web;
using Application.Common.Interfaces;
using Application.Common.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

using Domain;
namespace API.Auth;

/// <summary>
/// Authenticates business-partner requests by a static API key instead of a JWT.
///
/// The partner sends their key in the <c>X-Api-Key</c> header (or
/// <c>Authorization: ApiKey &lt;key&gt;</c>). We hash it, look up an active
/// <c>PartnerApiKey</c>, and issue a principal carrying the owning customer's id
/// as a <c>customerId</c> claim — the same claim shape customer JWTs use, so the
/// order pipeline downstream is identical.
/// </summary>
public sealed class ApiKeyAuthenticationHandler
    : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "ApiKey";
    private const string HeaderName = "X-Api-Key";

    private readonly IAppDbContext _db;

    public ApiKeyAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IAppDbContext db)
        : base(options, logger, encoder)
    {
        _db = db;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var rawKey = ExtractKey();
        if (string.IsNullOrWhiteSpace(rawKey))
            return AuthenticateResult.NoResult();

        var hash = ApiKeyHasher.Hash(rawKey);

        var key = await _db.PartnerApiKeys
            .FirstOrDefaultAsync(k => k.KeyHash == hash && k.IsActive && k.RevokedAt == null);

        if (key is null)
            return AuthenticateResult.Fail("Invalid or revoked API key.");

        // Best-effort "last used" stamp; never fail the request over it.
        try
        {
            key.LastUsedAt = CustomTime.Now;
            await _db.SaveChangesAsync();
        }
        catch
        {
            // ignore — telemetry only
        }

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, key.Id.ToString()),
            new Claim("customerId", key.CustomerId.ToString()),
            new Claim("partnerKeyId", key.Id.ToString()),
        };

        var identity  = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket    = new AuthenticationTicket(principal, SchemeName);
        return AuthenticateResult.Success(ticket);
    }

    private string? ExtractKey()
    {
        if (Request.Headers.TryGetValue(HeaderName, out var headerValues))
        {
            var value = headerValues.ToString();
            if (!string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }

        // Fallback: Authorization: ApiKey <key>
        var auth = Request.Headers.Authorization.ToString();
        const string prefix = "ApiKey ";
        if (auth.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return auth[prefix.Length..].Trim();

        return null;
    }
}
