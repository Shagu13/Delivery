using Application.Addresses.Queries;
using Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// Server-side proxy for address autocomplete. Keeps the geocoding provider's
/// API key on the server (never exposed to the browser). Requires authentication
/// so only signed-in users (creating orders) can consume the upstream quota.
/// </summary>
[Authorize]
public sealed class AddressController : BaseController
{
    // GET /api/address/autocomplete?text=rust&lang=en
    [HttpGet("autocomplete")]
    [ProducesResponseType(typeof(IReadOnlyList<AddressSuggestion>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Autocomplete(
        [FromQuery] string? text,
        [FromQuery] string? lang,
        CancellationToken ct)
    {
        var result = await Sender.Send(
            new GetAddressSuggestionsQuery(text ?? string.Empty, lang ?? "en"), ct);
        return Ok(result);
    }
}
