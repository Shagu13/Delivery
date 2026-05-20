using Application.WeightPriceTiers.Commands;
using Application.WeightPriceTiers.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WeightPriceTiersController : BaseController
{
    // ── GET /api/weightpricetiers ─────────────────────────────────────────────
    /// <summary>Returns all active weight price tiers. Public — used by senders in the order form.</summary>
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var result = await Sender.Send(new GetAllWeightPriceTiersQuery(), ct);
        return Ok(result);
    }

    // ── POST /api/weightpricetiers ────────────────────────────────────────────
    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create(
        [FromBody] CreateWeightPriceTierCommand command,
        CancellationToken ct)
    {
        var result = await Sender.Send(command, ct);
        return CreatedAtAction(nameof(GetAll), result);
    }

    // ── PUT /api/weightpricetiers/{id} ────────────────────────────────────────
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateWeightPriceTierCommand command,
        CancellationToken ct)
    {
        if (id != command.Id) return BadRequest("ID mismatch.");
        var result = await Sender.Send(command, ct);
        return Ok(result);
    }

    // ── DELETE /api/weightpricetiers/{id} ─────────────────────────────────────
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await Sender.Send(new DeleteWeightPriceTierCommand(id), ct);
        return NoContent();
    }
}