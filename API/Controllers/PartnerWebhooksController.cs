using API.Models.Partner;
using Application.PartnerWebhooks.Commands.CreatePartnerWebhook;
using Application.PartnerWebhooks.Commands.DeletePartnerWebhook;
using Application.PartnerWebhooks.DTOs;
using Application.PartnerWebhooks.Queries.GetPartnerWebhooks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// Admin management of partner webhook subscriptions. Each webhook belongs to a
/// Customer (partner); status changes on that partner's orders are POSTed to its URL.
/// </summary>
[Authorize(Roles = "Admin")]
public sealed class PartnerWebhooksController : BaseController
{
    // ── POST /api/partnerwebhooks  — register an endpoint (returns signing secret) ──
    [HttpPost]
    [ProducesResponseType(typeof(PartnerWebhookDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Create(
        [FromBody] CreatePartnerWebhookRequest request,
        CancellationToken ct)
    {
        var result = await Sender.Send(
            new CreatePartnerWebhookCommand(request.CustomerId, request.Url), ct);
        return CreatedAtAction(nameof(GetAll), new { customerId = result.CustomerId }, result);
    }

    // ── GET /api/partnerwebhooks?customerId=  — list ───────────────────────────
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<PartnerWebhookDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll([FromQuery] Guid? customerId, CancellationToken ct)
    {
        var result = await Sender.Send(new GetPartnerWebhooksQuery(customerId), ct);
        return Ok(result);
    }

    // ── DELETE /api/partnerwebhooks/{id}  — deactivate ─────────────────────────
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await Sender.Send(new DeletePartnerWebhookCommand(id), ct);
        return NoContent();
    }
}
