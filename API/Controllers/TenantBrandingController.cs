using Application.Tenants.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// Public white-label branding lookup. Anonymous — the SPA calls this on load (before any
/// login) to theme the homepage for a tenant's host. Returns 204 when the host has no active
/// tenant, so the frontend falls back to the root (dilo) branding.
/// </summary>
public sealed class TenantBrandingController : BaseController
{
    // ── GET /api/tenantbranding?host=livoexpress.ge ───────────────────────────
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(TenantBrandingDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Get([FromQuery] string? host, CancellationToken ct)
    {
        var dto = await Sender.Send(new GetTenantBrandingQuery(host ?? string.Empty), ct);
        return dto is null ? NoContent() : Ok(dto);
    }
}
