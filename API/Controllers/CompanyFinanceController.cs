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
        [FromQuery] string[]? areaCity,
        [FromQuery] string[]? areaDistrict,
        CancellationToken ct)
    {
        // areaCity / areaDistrict are aligned by position: a blank district means "whole city".
        var areas = new List<AreaFilterSpec>();
        if (areaCity is not null)
        {
            for (int i = 0; i < areaCity.Length; i++)
            {
                var c = areaCity[i]?.Trim();
                if (string.IsNullOrEmpty(c)) continue;
                var d = (areaDistrict is not null && i < areaDistrict.Length) ? areaDistrict[i]?.Trim() : null;
                areas.Add(new AreaFilterSpec(c, string.IsNullOrEmpty(d) ? null : d));
            }
        }

        var result = await Sender.Send(new GetCompanyFinanceOverviewQuery(from, to, areas), ct);
        return Ok(result);
    }
}
