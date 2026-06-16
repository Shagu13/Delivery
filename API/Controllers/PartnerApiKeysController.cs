using API.Models.Partner;
using Application.PartnerApiKeys.Commands.IssuePartnerApiKey;
using Application.PartnerApiKeys.Commands.RevokePartnerApiKey;
using Application.PartnerApiKeys.DTOs;
using Application.PartnerApiKeys.Queries.GetPartnerApiKeys;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// Admin management of partner API keys. Each key is bound to a Customer (the partner)
/// and lets that partner's backend place orders via <c>PartnerOrdersController</c>.
/// </summary>
[Authorize(Roles = "Admin")]
public sealed class PartnerApiKeysController : BaseController
{
    // ── POST /api/partnerapikeys  — issue a new key (raw key returned once) ────
    [HttpPost]
    [ProducesResponseType(typeof(IssuePartnerApiKeyResultDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Issue(
        [FromBody] IssuePartnerApiKeyRequest request,
        CancellationToken ct)
    {
        var result = await Sender.Send(
            new IssuePartnerApiKeyCommand(request.CustomerId, request.Name), ct);
        return CreatedAtAction(nameof(GetAll), new { customerId = result.CustomerId }, result);
    }

    // ── GET /api/partnerapikeys?customerId=  — list keys ───────────────────────
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<PartnerApiKeyDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll([FromQuery] Guid? customerId, CancellationToken ct)
    {
        var result = await Sender.Send(new GetPartnerApiKeysQuery(customerId), ct);
        return Ok(result);
    }

    // ── DELETE /api/partnerapikeys/{id}  — revoke a key ────────────────────────
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Revoke(Guid id, CancellationToken ct)
    {
        await Sender.Send(new RevokePartnerApiKeyCommand(id), ct);
        return NoContent();
    }
}
