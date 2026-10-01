using Application.LabelDesigns.Commands;
using Application.LabelDesigns.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// The signed-in user's own saved parcel-label print settings (size, custom dimensions, logo
/// position). Every role has its own row, scoped by the JWT user id — nobody can read or write
/// another user's settings.
/// </summary>
[Authorize]
public sealed class LabelDesignController : BaseController
{
    // ── GET /api/labeldesign — 204 when the caller has never saved any ──────
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var result = await Sender.Send(new GetLabelDesignQuery(CurrentUserId), ct);
        return result is null ? NoContent() : Ok(result);
    }

    // ── PUT /api/labeldesign ────────────────────────────────────────────────
    [HttpPut]
    public async Task<IActionResult> Save([FromBody] LabelDesignRequest request, CancellationToken ct)
    {
        await Sender.Send(new SaveLabelDesignCommand(CurrentUserId, request.PrefsJson), ct);
        return NoContent();
    }
}

public sealed record LabelDesignRequest(string PrefsJson);
