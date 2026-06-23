using Application.Tenants.Commands;
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

    // ── GET /api/tenantbranding/mine  (co-admin loads own branding + homepage) ──
    [HttpGet("mine")]
    [Authorize(Roles = "TenantAdmin")]
    [ProducesResponseType(typeof(MyTenantBrandingDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var tid = CurrentTenantId ?? throw new UnauthorizedAccessException("Tenant ID not found in token.");
        return Ok(await Sender.Send(new GetMyTenantBrandingQuery(tid), ct));
    }

    // ── PUT /api/tenantbranding/mine  (co-admin edits own storefront) ───────────
    [HttpPut("mine")]
    [Authorize(Roles = "TenantAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> UpdateMine([FromBody] UpdateMyBrandingRequest request, CancellationToken ct)
    {
        var tid = CurrentTenantId ?? throw new UnauthorizedAccessException("Tenant ID not found in token.");
        await Sender.Send(new UpdateMyTenantBrandingCommand(
            tid, request.DisplayName, request.LogoUrl, request.PrimaryColor, request.HomepageJson), ct);
        return NoContent();
    }
}

public sealed record UpdateMyBrandingRequest(
    string DisplayName, string? LogoUrl, string? PrimaryColor, string? HomepageJson);
