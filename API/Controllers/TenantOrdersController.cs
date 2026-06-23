using API.Models.GroupOrders;
using Application.GroupOrders.Commands.AcceptTenantGroupOrder;
using Application.GroupOrders.Queries.GetTenantGroupOrders;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// The tenant co-admin (TenantAdmin) portal for orders. Strictly scoped to the caller's
/// own tenant (from the JWT <c>tenantId</c> claim). The co-admin can view and ACCEPT their
/// sub-customers' batches — courier assignment, pricing and warehouse steps stay Admin-only
/// and live on GroupOrdersController.
/// </summary>
[Authorize(Roles = "TenantAdmin")]
public sealed class TenantOrdersController : BaseController
{
    // The tenant id is always taken from the verified JWT claim, never the request.
    private Guid TenantId =>
        CurrentTenantId ?? throw new UnauthorizedAccessException("Tenant ID not found in token.");

    // ── GET /api/tenantorders ─────────────────────────────────────────────────
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<AdminGroupOrderResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var result = await Sender.Send(new GetTenantGroupOrdersQuery(TenantId), ct);
        // includeRevenue: false — a tenant never sees dilo's internal company margin.
        return Ok(result.Select(go => GroupOrdersController.MapToAdminResponse(go, includeRevenue: false)).ToList());
    }

    // ── PUT /api/tenantorders/{id}/accept ─────────────────────────────────────
    [HttpPut("{id:guid}/accept")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Accept(Guid id, CancellationToken ct)
    {
        await Sender.Send(new AcceptTenantGroupOrderCommand(id, TenantId), ct);
        return NoContent();
    }
}
