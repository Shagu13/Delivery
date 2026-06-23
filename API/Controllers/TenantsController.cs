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
}
