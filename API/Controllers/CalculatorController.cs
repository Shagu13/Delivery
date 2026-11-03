using Application.Calculator.DTOs;
using Application.Calculator.Queries.CalculatePrice;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace API.Controllers;

[Route("api/calculator")]
public sealed class CalculatorController : BaseController
{
    /// <summary>
    /// Returns the delivery price for a given destination district — see
    /// <see cref="CalculatePriceQueryHandler"/> for the pricing rules (pickup swap,
    /// customer special price / negotiated tier, weight-tier override).
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(CalculatedPriceDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Calculate(
        [FromQuery] Guid  districtId,
        [FromQuery] Guid? weightTierId,
        [FromQuery] Guid? fromDistrictId,
        CancellationToken ct)
    {
        // A logged-in customer gets their negotiated rates; anyone else gets the default.
        Guid? customerId = Guid.TryParse(User.FindFirstValue("customerId"), out var id) ? id : null;

        var result = await Sender.Send(
            new CalculatePriceQuery(districtId, weightTierId, fromDistrictId, customerId), ct);

        return result is null ? NotFound() : Ok(result);
    }
}
