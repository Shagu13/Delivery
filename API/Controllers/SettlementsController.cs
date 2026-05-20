using Application.Settlements.Commands;
using Application.Settlements.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace API.Controllers;

public sealed class SettlementsController : BaseController
{
    // ── GET /api/settlements/preview?courierId={id}&date={yyyy-MM-dd}  (Admin) ─
    /// <summary>
    /// Returns aggregated order data for a courier on a given date, ready to
    /// be reviewed before creating a settlement record.
    /// </summary>
    [HttpGet("preview")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(Application.Settlements.Queries.SettlementPreviewDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPreview(
        [FromQuery] Guid courierId,
        [FromQuery] DateOnly date,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetSettlementPreviewQuery(courierId, date), ct);
        return Ok(result);
    }

    // ── GET /api/settlements/my  (Courier) ───────────────────────────────────
    /// <summary>
    /// Returns all daily settlement records that belong to the authenticated courier,
    /// newest first. The courier can use this to review their salary history and
    /// the cash amounts they collected from recipients.
    /// </summary>
    [HttpGet("my")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(typeof(IReadOnlyList<Application.Settlements.DTOs.CourierSettlementItemDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMy(CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var result = await Sender.Send(new GetMyCourierSettlementsQuery(userId), ct);
        return Ok(result);
    }

    // ── POST /api/settlements  (Admin) ────────────────────────────────────────
    /// <summary>
    /// Creates a DailySettlement record for the given courier and date.
    /// All financial totals (cash collected, courier salary, company revenue,
    /// transfer to company) are computed server-side from delivered orders —
    /// the caller only needs to supply the courier ID and date.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(
        [FromBody] CreateSettlementRequest request,
        CancellationToken ct)
    {
        var id = await Sender.Send(
            new CreateDailySettlementCommand(request.CourierId, request.Date), ct);

        return CreatedAtAction(
            nameof(GetPreview),
            new { courierId = request.CourierId, date = request.Date },
            new { settlementId = id });
    }
}

// ── Local request model ────────────────────────────────────────────────────────
public sealed record CreateSettlementRequest(
    Guid     CourierId,
    DateOnly Date
);
