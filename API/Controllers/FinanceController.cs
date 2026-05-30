using Application.Finance.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class FinanceController : BaseController
{
    // ── GET /api/finance/summary ──────────────────────────────────────────────
    /// <summary>
    /// Returns month-by-month financial summaries and a paginated payment ledger
    /// for the admin Finance page.
    /// </summary>
    /// <param name="monthsBack">How many months back to include (default 6, max 24).</param>
    /// <param name="page">0-based ledger page index (default 0).</param>
    /// <param name="pageSize">Ledger rows per page (default 30, max 100).</param>
    /// <param name="type">Optional ledger type filter: SenderPaysCompany | CompanyPaysSender | CompanyPaysCourier | CourierHandsOverRevenue.</param>
    [HttpGet("summary")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(AdminFinancePageDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSummary(
        [FromQuery] int    monthsBack = 6,
        [FromQuery] int    page       = 0,
        [FromQuery] int    pageSize   = 30,
        [FromQuery] string? type      = null,
        CancellationToken  ct         = default)
    {
        monthsBack = Math.Clamp(monthsBack, 1, 24);
        pageSize   = Math.Clamp(pageSize,   1, 100);

        var result = await Sender.Send(
            new GetAdminFinanceSummaryQuery(monthsBack, page, pageSize, type), ct);

        return Ok(result);
    }
}
