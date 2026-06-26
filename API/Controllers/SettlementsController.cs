using Application.Settlements.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

using Domain;
namespace API.Controllers;

public sealed class SettlementsController : BaseController
{
    // ── GET /api/settlements/preview  (Admin) ─────────────────────────────────
    [HttpGet("preview")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(SettlementPreviewDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPreview(
        [FromQuery] Guid courierId,
        [FromQuery] DateOnly date,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetSettlementPreviewQuery(courierId, date), ct);
        return Ok(result);
    }

    // ── GET /api/settlements/active-couriers  (Admin) ─────────────────────────
    /// <summary>
    /// Returns the IDs of couriers who delivered at least one order on the given date,
    /// so the admin can narrow the settlement courier list to those active that day.
    /// </summary>
    [HttpGet("active-couriers")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<Guid>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetActiveCouriers(
        [FromQuery] DateOnly date,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCouriersWithDeliveriesOnDateQuery(date), ct);
        return Ok(result);
    }

    // ── GET /api/settlements/my  (Courier) ────────────────────────────────────
    [HttpGet("my")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(typeof(IReadOnlyList<Application.Settlements.DTOs.CourierSettlementItemDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMy(
        [FromQuery] int? year,
        [FromQuery] int? month,
        CancellationToken ct)
    {
        var now    = CustomTime.Now;
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var result = await Sender.Send(new GetMyCourierSettlementsQuery(
            CourierUserId: userId,
            Year:          year  ?? now.Year,
            Month:         month ?? now.Month
        ), ct);
        return Ok(result);
    }

    // ── GET /api/settlements/by-courier/{courierId}  (Admin) ─────────────────
    [HttpGet("by-courier/{courierId:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<Application.Settlements.DTOs.CourierSettlementItemDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetByCourier(Guid courierId, CancellationToken ct)
    {
        var result = await Sender.Send(new GetAdminCourierSettlementsQuery(courierId), ct);
        return Ok(result);
    }
}
