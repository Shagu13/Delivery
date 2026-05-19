using Application.Sms.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class SmsController : BaseController
{
    // ── GET /api/sms/balance ─────────────────────────────────────────────────
    [HttpGet("balance")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(SmsBalanceResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetBalance(CancellationToken ct)
    {
        var balance = await Sender.Send(new GetSmsBalanceQuery(), ct);
        return Ok(new SmsBalanceResponse(balance));
    }
}

public sealed record SmsBalanceResponse(int Credits);
