using API.Excel;
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

    // ── GET /api/companyfinance/orders  (Admin) ───────────────────────────────
    // The orders behind the overview's profit figures, same filters.
    [HttpGet("orders")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(CompanyFinanceOrdersDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetOrders(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] string? city,
        [FromQuery] string? district,
        CancellationToken ct)
    {
        var cities    = city?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var districts = district?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var result = await Sender.Send(new GetCompanyFinanceOrdersQuery(from, to, cities, districts), ct);
        return Ok(result);
    }

    // ── GET /api/companyfinance/orders/export  (Admin) ────────────────────────
    // The same list as Excel. No courier salary / margin columns — see CompanyFinanceOrdersExcelBuilder.
    [HttpGet("orders/export")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ExportOrders(
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] string? city,
        [FromQuery] string? district,
        [FromQuery] string lang = "ka",
        CancellationToken ct = default)
    {
        var cities    = city?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var districts = district?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var result = await Sender.Send(new GetCompanyFinanceOrdersQuery(from, to, cities, districts), ct);
        return File(
            CompanyFinanceOrdersExcelBuilder.Build(result, lang),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"company-orders-{from:dd.MM}-{to:dd.MM}.xlsx");
    }
}
