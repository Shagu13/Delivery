using Application.CompanyFinance.DTOs;
using Application.CompanyFinance.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class CompanyFinanceController : BaseController
{
    // ── GET /api/companyfinance/overview  (Admin) ─────────────────────────────
    [HttpGet("overview")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(CompanyFinanceOverviewDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetOverview(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] string? city,
        [FromQuery] string? district,
        CancellationToken ct)
    {
        // city / district are comma-separated multi-select facets (mirrors GroupOrders' filter convention).
        var cities    = city?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var districts = district?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var result = await Sender.Send(new GetCompanyFinanceOverviewQuery(from, to, cities, districts), ct);
        return Ok(result);
    }
}
