using Application.Settlements.Commands;
using Application.Settlements.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class SettlementsController : BaseController
{
    // ── GET /api/settlements/preview?courierId={id}&date={yyyy-MM-dd}  (Admin) ─
    /// <summary>
    /// Returns aggregated order data for a courier on a given date, ready to
    /// be reviewed and edited before creating a settlement record.
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

    // ── POST /api/settlements  (Admin) ────────────────────────────────────────
    /// <summary>
    /// Creates a DailySettlement record from admin-confirmed (and potentially
    /// edited) totals. All delivered orders for the day must already have full
    /// financial data (CourierSalary, CompanyServicePrice, CompanyRevenue > 0).
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
        var id = await Sender.Send(new CreateDailySettlementCommand(
            CourierId:                  request.CourierId,
            Date:                       request.Date,
            TotalOrdersPickedUp:        request.TotalOrdersPickedUp,
            TotalOrdersDelivered:       request.TotalOrdersDelivered,
            TotalAmountOfCashCollected: request.TotalAmountOfCashCollected,
            TotalCompanyServiceRevenue: request.TotalCompanyServiceRevenue,
            TotalCourierSalary:         request.TotalCourierSalary,
            TotalCompanyNetIncome:      request.TotalCompanyNetIncome
        ), ct);

        return CreatedAtAction(
            nameof(GetPreview),
            new { courierId = request.CourierId, date = request.Date },
            new { settlementId = id });
    }
}

// ── Local request model ────────────────────────────────────────────────────────
public sealed record CreateSettlementRequest(
    Guid     CourierId,
    DateOnly Date,
    int      TotalOrdersPickedUp,
    int      TotalOrdersDelivered,
    decimal? TotalAmountOfCashCollected,
    decimal  TotalCompanyServiceRevenue,
    decimal  TotalCourierSalary,
    decimal  TotalCompanyNetIncome
);
