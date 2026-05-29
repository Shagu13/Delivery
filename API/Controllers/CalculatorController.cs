using Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace API.Controllers;

[ApiController]
[Route("api/calculator")]
public sealed class CalculatorController : ControllerBase
{
    private readonly IAppDbContext _context;

    public CalculatorController(IAppDbContext context) => _context = context;

    /// <summary>
    /// Returns the delivery price for a given destination district.
    /// If the caller is an authenticated Customer with negotiated tier prices,
    /// those are applied. Otherwise the district's default price is returned.
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(CalculatorResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Calculate(
        [FromQuery] Guid  districtId,
        [FromQuery] Guid? weightTierId,
        CancellationToken ct)
    {
        var district = await _context.Districts
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == districtId && d.DateDeleted == null, ct);

        if (district is null) return NotFound();

        // Start with the district's own default price
        decimal price = district.CompanyServicePrice ?? 0;
        string  tier  = "default";

        // If the caller is a logged-in customer, try to apply their negotiated tier
        var customerIdClaim = User.FindFirstValue("customerId");
        if (Guid.TryParse(customerIdClaim, out var customerId))
        {
            var customer = await _context.Customers
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == customerId, ct);

            if (customer is not null)
            {
                if (district.IsCapitalTerritory && customer.CompanyServiceCapitalPrice is > 0)
                {
                    price = customer.CompanyServiceCapitalPrice!.Value;
                    tier  = "capital";
                }
                else if (district.IsCityTerritory && customer.CompanyServiceCityPrice is > 0)
                {
                    price = customer.CompanyServiceCityPrice!.Value;
                    tier  = "city";
                }
                else if (customer.CompanyServiceDistrictPrice is > 0)
                {
                    price = customer.CompanyServiceDistrictPrice!.Value;
                    tier  = "district";
                }
            }
        }

        // If a weight tier is selected, its zone price overrides whatever was resolved above
        if (weightTierId.HasValue)
        {
            var weightTier = await _context.WeightPriceTiers
                .AsNoTracking()
                .FirstOrDefaultAsync(w => w.Id == weightTierId.Value && w.DateDeleted == null, ct);

            if (weightTier is not null)
            {
                decimal? weightPrice = district.IsCapitalTerritory ? weightTier.CapitalPrice
                                     : district.IsCityTerritory    ? weightTier.CityPrice
                                     :                               weightTier.DistrictPrice;

                if (weightPrice.HasValue)
                    price = weightPrice.Value;
            }
        }

        return Ok(new CalculatorResult(price, tier));
    }
}

public sealed record CalculatorResult(decimal Price, string Tier);
