using Application.Cities.Commands.CreateCity;
using Application.Cities.Commands.CreateDistrict;
using Application.Cities.Commands.DeleteCity;
using Application.Cities.Commands.DeleteDistrict;
using Application.Cities.Commands.EditCity;
using Application.Cities.Commands.EditDistrict;
using Application.Cities.Commands.RestoreCity;
using Application.Cities.Commands.RestoreDistrict;
using Application.Cities.Commands.SetDeliverySchedule;
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

    // ── GET /api/cities/all-districts ────────────────────────────────────────
    /// <summary>
    /// Returns a flat list of every active district with its parent city details.
    /// Used by the price calculator "To" picker.
    /// </summary>
    [HttpGet("all-districts")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<AllDistrictEntry>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAllDistricts(CancellationToken ct)
    {
        var districts = await (
            from d in _context.Districts.AsNoTracking()
            where d.DateDeleted == null && d.City.DateDeleted == null
            join s in _context.DeliverySchedules.Where(s => s.DateDeleted == null)
                on d.CityId equals s.CityId into schedules
            from s in schedules.DefaultIfEmpty()
            orderby d.City.CityName, d.DistrictName
            select new AllDistrictEntry(
                d.Id,
                d.DistrictName,
                d.DistrictNameGeo,
                d.City.Id,
                d.City.CityName,
                d.City.CityNameGeo,
                d.CompanyServicePrice,
                d.IsCapitalTerritory,
                d.IsCityTerritory,
                s != null,
                s != null && s.Monday,
                s != null && s.Tuesday,
                s != null && s.Wednesday,
                s != null && s.Thursday,
                s != null && s.Friday,
                s != null && s.Saturday,
                s != null && s.Sunday)
        ).ToListAsync(ct);

        return Ok(districts);
    }

    // ── GET /api/cities/{cityId}/delivery-schedule ────────────────────────────
    /// <summary>
    /// Which days of the week the city (and all its districts) receive deliveries.
    /// scheduleSet is false when the city has never been configured — the day flags are
    /// then meaningless and the caller should show a "not set" state rather than "no days".
    /// </summary>
    [HttpGet("{cityId:guid}/delivery-schedule")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(DeliveryScheduleResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetDeliverySchedule(Guid cityId, CancellationToken ct)
    {
        var cityExists = await _context.Cities.AnyAsync(c => c.Id == cityId && c.DateDeleted == null, ct);
        if (!cityExists) return NotFound();

        var schedule = await _context.DeliverySchedules
            .AsNoTracking()
            .Where(s => s.CityId == cityId && s.DateDeleted == null)
            .Select(s => new DeliveryScheduleResponse(true, s.Monday, s.Tuesday, s.Wednesday, s.Thursday, s.Friday, s.Saturday, s.Sunday))
            .FirstOrDefaultAsync(ct);

        return Ok(schedule ?? new DeliveryScheduleResponse(false, false, false, false, false, false, false, false));
    }

    // ── PUT /api/cities/{cityId}/delivery-schedule  (Admin) ───────────────────
    [HttpPut("{cityId:guid}/delivery-schedule")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetDeliverySchedule(
        Guid cityId,
        [FromBody] SetDeliveryScheduleRequest request,
        CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new SetCityDeliveryScheduleCommand(
                cityId, request.Monday, request.Tuesday, request.Wednesday, request.Thursday,
                request.Friday, request.Saturday, request.Sunday), ct);
            return NoContent();
        }
        catch (NotFoundException ex) { return NotFound(ex.Message); }
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

    // ── GET /api/cities/deleted  (Admin) ──────────────────────────────────────
    /// <summary>Returns soft-deleted cities so an admin can reactivate them.</summary>
    [HttpGet("deleted")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IReadOnlyList<CityResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDeletedCities(CancellationToken ct)
    {
        var cities = await _context.Cities
            .AsNoTracking()
            .Where(c => c.DateDeleted != null)
            .OrderBy(c => c.CityName)
            .Select(c => new CityResponse(c.Id, c.CityName, c.CityNameGeo))
            .ToListAsync(ct);

        return Ok(cities);
    }

    // ── POST /api/cities/{cityId}/restore  (Admin) ────────────────────────────
    [HttpPost("{cityId:guid}/restore")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RestoreCity(Guid cityId, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new RestoreCityCommand(cityId), ct);
            return NoContent();
        }
        catch (NotFoundException ex) { return NotFound(ex.Message); }
        catch (ConflictException ex) { return Conflict(ex.Message); }
    }

    // ── POST /api/cities  (Admin) ─────────────────────────────────────────────
    [HttpPost]
    [Authorize(Roles = "Admin,Operator")]
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
    [Authorize(Roles = "Admin,Operator")]
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
    [Authorize(Roles = "Admin,Operator")]
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
            .Select(d => new DistrictResponse(d.Id, d.DistrictName, d.DistrictNameGeo, d.CompanyServicePrice, d.IsCapitalTerritory, d.IsCityTerritory))
            .ToListAsync(ct);

        return Ok(districts);
    }

    // ── GET /api/cities/{cityId}/districts/deleted  (Admin) ───────────────────
    /// <summary>Returns soft-deleted districts of a city so an admin can reactivate them.</summary>
    [HttpGet("{cityId:guid}/districts/deleted")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IReadOnlyList<DistrictResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDeletedDistricts(Guid cityId, CancellationToken ct)
    {
        var districts = await _context.Districts
            .AsNoTracking()
            .Where(d => d.CityId == cityId && d.DateDeleted != null)
            .OrderBy(d => d.DistrictName)
            .Select(d => new DistrictResponse(d.Id, d.DistrictName, d.DistrictNameGeo, d.CompanyServicePrice, d.IsCapitalTerritory, d.IsCityTerritory))
            .ToListAsync(ct);

        return Ok(districts);
    }

    // ── POST /api/cities/districts/{districtId}/restore  (Admin) ──────────────
    [HttpPost("districts/{districtId:guid}/restore")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RestoreDistrict(Guid districtId, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new RestoreDistrictCommand(districtId), ct);
            return NoContent();
        }
        catch (NotFoundException ex) { return NotFound(ex.Message); }
        catch (ConflictException ex) { return Conflict(ex.Message); }
    }

    // ── POST /api/cities/{cityId}/districts  (Admin) ──────────────────────────
    [HttpPost("{cityId:guid}/districts")]
    [Authorize(Roles = "Admin,Operator")]
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
            var result = await _mediator.Send(new CreateDistrictCommand(cityId, request.DistrictName, request.DistrictNameGeo, request.CompanyServicePrice, request.IsCapitalTerritory, request.IsCityTerritory), ct);
            var response = new DistrictResponse(result.Id, result.DistrictName, result.DistrictNameGeo, result.CompanyServicePrice, result.IsCapitalTerritory, result.IsCityTerritory);
            return CreatedAtAction(nameof(GetDistricts), new { cityId }, response);
        }
        catch (NotFoundException ex) { return NotFound(ex.Message); }
        catch (ConflictException ex) { return Conflict(ex.Message); }
    }

    // ── PUT /api/cities/districts/{districtId}  (Admin) ───────────────────────
    [HttpPut("districts/{districtId:guid}")]
    [Authorize(Roles = "Admin,Operator")]
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
            await _mediator.Send(new EditDistrictCommand(districtId, request.DistrictName, request.DistrictNameGeo, request.CompanyServicePrice, request.IsCapitalTerritory, request.IsCityTerritory), ct);
            return NoContent();
        }
        catch (NotFoundException ex) { return NotFound(ex.Message); }
        catch (ConflictException ex) { return Conflict(ex.Message); }
    }

    // ── DELETE /api/cities/districts/{districtId}  (Admin) ────────────────────
    [HttpDelete("districts/{districtId:guid}")]
    [Authorize(Roles = "Admin,Operator")]
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
    [Authorize(Roles = "Admin,Operator")]
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

    // ── PUT /api/cities/districts/{districtId}/territory  (Admin) ─────────────
    [HttpPut("districts/{districtId:guid}/territory")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> SetDistrictTerritory(
        Guid districtId,
        [FromBody] SetDistrictTerritoryRequest request,
        CancellationToken ct)
    {
        await _mediator.Send(new SetDistrictTerritoryCommand(districtId, request.IsCapitalTerritory, request.IsCityTerritory), ct);
        return NoContent();
    }
}

// ── Request / Response records ────────────────────────────────────────────────
public sealed record CityResponse(Guid Id, string CityName, string? CityNameGeo);
public sealed record DistrictResponse(Guid Id, string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice, bool IsCapitalTerritory, bool IsCityTerritory);
public sealed record AllDistrictEntry(
    Guid DistrictId, string DistrictName, string? DistrictNameGeo,
    Guid CityId, string CityName, string? CityNameGeo,
    decimal? CompanyServicePrice, bool IsCapitalTerritory, bool IsCityTerritory,
    bool ScheduleSet, bool Monday, bool Tuesday, bool Wednesday, bool Thursday, bool Friday, bool Saturday, bool Sunday);
public sealed record DeliveryScheduleResponse(bool ScheduleSet, bool Monday, bool Tuesday, bool Wednesday, bool Thursday, bool Friday, bool Saturday, bool Sunday);
public sealed record SetDeliveryScheduleRequest(bool Monday, bool Tuesday, bool Wednesday, bool Thursday, bool Friday, bool Saturday, bool Sunday);
public sealed record SetDistrictServicePriceRequest(decimal? Price);
public sealed record SetDistrictTerritoryRequest(bool IsCapitalTerritory, bool IsCityTerritory);
public sealed record CreateCityRequest(string CityName, string? CityNameGeo);
public sealed record EditCityRequest(string CityName, string? CityNameGeo);
public sealed record CreateDistrictRequest(string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice, bool IsCapitalTerritory = false, bool IsCityTerritory = false);
public sealed record EditDistrictRequest(string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice, bool IsCapitalTerritory = false, bool IsCityTerritory = false);
