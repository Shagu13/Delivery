using Application.Orders.Queries.GetRecipientOrderHistory;
using Application.Orders.Queries.GetRecipientsDirectory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// Company-wide recipient directory — derived live from <see cref="Domain.Order"/> (there is
/// no Recipient table). Admin/Operator only.
/// </summary>
public sealed class RecipientsController : BaseController
{
    // ── GET /api/recipients  (Admin/Operator — search by name, phone, or address) ──
    [HttpGet]
    [Authorize(Roles = "Admin,Operator")]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] string search = "", CancellationToken ct = default)
    {
        var result = await Sender.Send(new GetRecipientsDirectoryQuery(page, pageSize, search), ct);
        return Ok(result);
    }

    // ── GET /api/recipients/{phone}/orders  (Admin/Operator — one recipient's order history) ──
    [HttpGet("{phone}/orders")]
    [Authorize(Roles = "Admin,Operator")]
    public async Task<IActionResult> GetOrderHistory(string phone, CancellationToken ct)
    {
        var result = await Sender.Send(new GetRecipientOrderHistoryQuery(phone), ct);
        return Ok(result);
    }
}
