using Application.Cities.Commands.CreateCity;
using Application.Cities.Commands.CreateDistrict;
using Application.Cities.Commands.DeleteCity;
using Application.Cities.Commands.DeleteDistrict;
using Application.Cities.Commands.EditCity;
using Application.Cities.Commands.EditDistrict;
using Application.Common.Exceptions;
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
        _context  = context;
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

    // ── POST /api/cities  (Admin) ─────────────────────────────────────────────
    [HttpPost]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(CityResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateCity(
        [FromBody] CreateCityRequest request,
        CancellationToken ct)
    {
        try
        {
            var result = await _mediator.Send(new CreateCityCommand(request.CityName, request.CityNameGeo), ct);
            var response = new CityResponse(result.Id, result.CityName, result.CityNameGeo);
            return CreatedAtAction(nameof(GetAll), response);
        }
        catch (ConflictException ex) { return Conflict(ex.Message); }
    }

    // ── PUT /api/cities/{cityId}  (Admin) ─────────────────────────────────────
    [HttpPut("{cityId:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> EditCity(
        Guid cityId,
        [FromBody] EditCityRequest request,
        CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new EditCityCommand(cityId, request.CityName, request.CityNameGeo), ct);
            return NoContent();
        }
        catch (NotFoundException ex) { return NotFound(ex.Message); }
        catch (ConflictException ex) { return Conflict(ex.Message); }
    }

    // ── DELETE /api/cities/{cityId}  (Admin) ──────────────────────────────────
    [HttpDelete("{cityId:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteCity(Guid cityId, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new DeleteCityCommand(cityId), ct);
            return NoContent();
        }
        catch (NotFoundException ex) { return NotFound(ex.Message); }
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

    // ── POST /api/cities/{cityId}/districts  (Admin) ──────────────────────────
    [HttpPost("{cityId:guid}/districts")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(DistrictResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateDistrict(
        Guid cityId,
        [FromBody] CreateDistrictRequest request,
        CancellationToken ct)
    {
        try
        {
            var result = await _mediator.Send(new CreateDistrictCommand(cityId, request.DistrictName, request.DistrictNameGeo, request.CompanyServicePrice), ct);
            var response = new DistrictResponse(result.Id, result.DistrictName, result.DistrictNameGeo, result.CompanyServicePrice);
            return CreatedAtAction(nameof(GetDistricts), new { cityId }, response);
        }
        catch (NotFoundException ex) { return NotFound(ex.Message); }
        catch (ConflictException ex) { return Conflict(ex.Message); }
    }

    // ── PUT /api/cities/districts/{districtId}  (Admin) ───────────────────────
    [HttpPut("districts/{districtId:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> EditDistrict(
        Guid districtId,
        [FromBody] EditDistrictRequest request,
        CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new EditDistrictCommand(districtId, request.DistrictName, request.DistrictNameGeo, request.CompanyServicePrice), ct);
            return NoContent();
        }
        catch (NotFoundException ex) { return NotFound(ex.Message); }
        catch (ConflictException ex) { return Conflict(ex.Message); }
    }

    // ── DELETE /api/cities/districts/{districtId}  (Admin) ────────────────────
    [HttpDelete("districts/{districtId:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteDistrict(Guid districtId, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new DeleteDistrictCommand(districtId), ct);
            return NoContent();
        }
        catch (NotFoundException ex) { return NotFound(ex.Message); }
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

// ── Request / Response records ────────────────────────────────────────────────
public sealed record CityResponse(Guid Id, string CityName, string? CityNameGeo);
public sealed record DistrictResponse(Guid Id, string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice);
public sealed record SetDistrictServicePriceRequest(decimal? Price);
public sealed record CreateCityRequest(string CityName, string? CityNameGeo);
public sealed record EditCityRequest(string CityName, string? CityNameGeo);
public sealed record CreateDistrictRequest(string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice);
public sealed record EditDistrictRequest(string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice);
