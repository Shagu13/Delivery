using Application.CustomerStatistics.DTOs;
using Application.CustomerStatistics.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class CustomerStatisticsController : BaseController
{
    // ── GET /api/customerstatistics/my  (Customer) — read-only ────────────────
    // Optional ?year= selects the calendar year; omitted = most recent active year.
    [HttpGet("my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(CustomerStatisticsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMy(
        [FromQuery] int? year,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetMyCustomerStatisticsQuery(CurrentUserId, year), ct);
        return Ok(result);
    }
}
