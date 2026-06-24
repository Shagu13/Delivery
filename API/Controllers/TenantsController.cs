using Application.Tenants.Commands;
using Application.Tenants.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// White-label tenants. Admin-only for now (used by the customer→tenant assignment UI).
/// Public branding lookup will live here later.
/// </summary>
[Authorize(Roles = "Admin")]
public sealed class TenantsController : BaseController
{
    // ── GET /api/tenants ──────────────────────────────────────────────────────
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<TenantDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken ct)
        => Ok(await Sender.Send(new GetAllTenantsQuery(), ct));

    // ── POST /api/tenants  (create tenant + its co-admin login) ────────────────
    // Tenant management (create/edit) is restricted to the "systemadmin" account.
    [HttpPost]
    [Authorize(Policy = "SystemAdmin")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Create([FromBody] CreateTenantRequest request, CancellationToken ct)
    {
        var id = await Sender.Send(new CreateTenantCommand(
            request.Host, request.DisplayName, request.LogoUrl, request.PrimaryColor,
            request.CoAdminFirstName, request.CoAdminLastName,
            request.CoAdminEmail, request.CoAdminPassword), ct);
        return CreatedAtAction(nameof(GetAll), new { id }, new { id });
    }

    // ── PUT /api/tenants/{id}  (edit host + branding + active) ─────────────────
    [HttpPut("{id:guid}")]
    [Authorize(Policy = "SystemAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTenantRequest request, CancellationToken ct)
    {
        await Sender.Send(new UpdateTenantCommand(
            id, request.Host, request.DisplayName, request.LogoUrl, request.PrimaryColor, request.IsActive), ct);
        return NoContent();
    }
}

public sealed record CreateTenantRequest(
    string Host, string DisplayName, string? LogoUrl, string? PrimaryColor,
    string CoAdminFirstName, string CoAdminLastName, string CoAdminEmail, string CoAdminPassword);

public sealed record UpdateTenantRequest(
    string Host, string DisplayName, string? LogoUrl, string? PrimaryColor, bool IsActive);
