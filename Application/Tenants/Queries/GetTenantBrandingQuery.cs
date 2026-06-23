using Application.Common.Interfaces;
using MediatR;

using Microsoft.EntityFrameworkCore;

namespace Application.Tenants.Queries;

/// <summary>
/// Public white-label branding for a host (e.g. "livoexpress.ge"), used by the SPA to theme
/// the homepage before login. Returns null when no active tenant matches the host — the
/// frontend then falls back to the root (dilo) branding.
/// </summary>
public sealed record TenantBrandingDto(string DisplayName, string? LogoUrl, string? PrimaryColor, string? HomepageJson);

public sealed record GetTenantBrandingQuery(string Host) : IRequest<TenantBrandingDto?>;

public sealed class GetTenantBrandingQueryHandler
    : IRequestHandler<GetTenantBrandingQuery, TenantBrandingDto?>
{
    private readonly IAppDbContext _context;
    public GetTenantBrandingQueryHandler(IAppDbContext context) => _context = context;

    public async Task<TenantBrandingDto?> Handle(GetTenantBrandingQuery request, CancellationToken cancellationToken)
    {
        var host = Normalize(request.Host);
        if (host.Length == 0) return null;

        return await _context.Tenants
            .Where(t => t.IsActive && t.Host.ToLower() == host)
            .Select(t => new TenantBrandingDto(t.DisplayName, t.LogoUrl, t.PrimaryColor, t.HomepageJson))
            .FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>Lower-cases, trims a port, and drops a leading "www." so the host matches the stored value.</summary>
    private static string Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var h = raw.Trim().ToLowerInvariant();
        int colon = h.IndexOf(':');
        if (colon >= 0) h = h[..colon];
        if (h.StartsWith("www.")) h = h[4..];
        return h;
    }
}
