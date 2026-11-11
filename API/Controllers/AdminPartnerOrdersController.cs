using Application.Common.Models;
using Application.PartnerOrders.DTOs;
using Application.PartnerOrders.Queries.GetAdminPartnerOrders;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// System-admin view of orders that arrived through the Partner API. Distinct from
/// <see cref="PartnerOrdersController"/>, which is the partner-facing (X-Api-Key) API.
/// </summary>
[Authorize(Policy = "SystemAdmin")]
public sealed class AdminPartnerOrdersController : BaseController
{
    // ── GET /api/admin/partner-orders?customerId=&search=&from=&to=&page=&pageSize= ──
    [HttpGet("/api/admin/partner-orders")]
    [ProducesResponseType(typeof(PagedResult<AdminPartnerOrderDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? customerId,
        [FromQuery] string? search,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var result = await Sender.Send(
            new GetAdminPartnerOrdersQuery(customerId, search, from, to, page, pageSize), ct);
        return Ok(result);
    }
}
