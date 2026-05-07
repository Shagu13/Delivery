using Application.Common.Interfaces;
using Application.Orders.Commands;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

[ApiController]
[Route("api/cities")]
public sealed class CitiesController : ControllerBase
{
    private readonly IAppDbContext _context;
    private readonly IMediator _mediator;

    public CitiesController(IAppDbContext context, IMediator mediator)
    {
        _context = context;
        _mediator = mediator;
    }

    // ── GET /api/cities ───────────────────────────────────────────────────────
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<CityResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var cities = await _context.Cities
            .AsNoTracking()
            .Where(c => c.DateDeleted == null)
            .OrderBy(c => c.CityName)
            .Select(c => new CityResponse(c.Id, c.CityName, c.CityNameGeo))
            .ToListAsync(ct);

        return Ok(cities);
    }

    // ── GET /api/cities/{cityId}/districts ────────────────────────────────────
    [HttpGet("{cityId:guid}/districts")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<DistrictResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetDistricts(Guid cityId, CancellationToken ct)
    {
        var cityExists = await _context.Cities
            .AnyAsync(c => c.Id == cityId && c.DateDeleted == null, ct);

        if (!cityExists) return NotFound();

        var districts = await _context.Districts
            .AsNoTracking()
            .Where(d => d.CityId == cityId && d.DateDeleted == null)
            .OrderBy(d => d.DistrictName)
            .Select(d => new DistrictResponse(d.Id, d.DistrictName, d.DistrictNameGeo, d.CompanyServicePrice))
            .ToListAsync(ct);

        return Ok(districts);
    }

    // ── PUT /api/cities/districts/{districtId}/service-price  (Admin) ─────────
    [HttpPut("districts/{districtId:guid}/service-price")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetDistrictServicePrice(
        Guid districtId,
        [FromBody] SetDistrictServicePriceRequest request,
        CancellationToken ct)
    {
        await _mediator.Send(new SetDistrictCompanyServicePriceCommand(districtId, request.Price), ct);
        return NoContent();
    }
}

// ── Response records ──────────────────────────────────────────────────────────
public sealed record CityResponse(Guid Id, string CityName, string? CityNameGeo);
public sealed record DistrictResponse(Guid Id, string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice);
public sealed record SetDistrictServicePriceRequest(decimal? Price);