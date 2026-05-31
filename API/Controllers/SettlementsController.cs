using Application.Settlements.Commands;
using Application.Settlements.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

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

    // ── GET /api/settlements/my  (Courier) ────────────────────────────────────
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

    // ── POST /api/settlements  (Admin) — create new ───────────────────────────
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

    // ── PUT /api/settlements  (Admin) — update existing ───────────────────────
    /// <summary>
    /// Recomputes and updates an existing DailySettlement for a courier on a given date.
    /// Use when new orders were delivered after the initial settlement was saved.
    /// Returns 404 if no settlement exists for that courier+date.
    /// Returns 409 if the settlement is locked (IsTheDayClosed = true).
    /// </summary>
    [HttpPut]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(
        [FromBody] CreateSettlementRequest request,
        CancellationToken ct)
    {
        var id = await Sender.Send(
            new UpdateDailySettlementCommand(request.CourierId, request.Date), ct);

        return Ok(new { settlementId = id });
    }
}

// ── Local request model ────────────────────────────────────────────────────────
public sealed record CreateSettlementRequest(
    Guid     CourierId,
    DateOnly Date
);
