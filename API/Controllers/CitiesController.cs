using Application.Cities.Commands.CreateCity;
using Application.Cities.Commands.CreateDistrict;
using Application.Cities.Commands.DeleteCity;
using Application.Cities.Commands.DeleteDistrict;
using Application.Cities.Commands.EditCity;
using Application.Cities.Commands.EditDistrict;
using Application.Cities.Commands.RestoreCity;
using Application.Cities.Commands.RestoreDistrict;
using Application.Cities.Commands.SetDeliverySchedule;
using Application.Cities.DTOs;
using Application.Cities.Queries.GetAllDistricts;
using Application.Cities.Queries.GetCities;
using Application.Cities.Queries.GetCityDeliverySchedule;
using Application.Cities.Queries.GetDistricts;
using Application.Common.Exceptions;
using Application.Orders.Commands;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/cities")]
public sealed class CitiesController : ControllerBase
{
    private readonly IMediator _mediator;

    public CitiesController(IMediator mediator) => _mediator = mediator;

    // ── GET /api/cities/all-districts ────────────────────────────────────────
    /// <summary>
    /// Returns a flat list of every active district with its parent city details.
    /// Used by the price calculator "To" picker.
    /// </summary>
    [HttpGet("all-districts")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<AllDistrictDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAllDistricts(CancellationToken ct)
        => Ok(await _mediator.Send(new GetAllDistrictsQuery(), ct));

    // ── GET /api/cities/{cityId}/delivery-schedule ────────────────────────────
    /// <summary>
    /// Which days of the week the city (and all its districts) receive deliveries.
    /// scheduleSet is false when the city has never been configured — the day flags are
    /// then meaningless and the caller should show a "not set" state rather than "no days".
    /// </summary>
    [HttpGet("{cityId:guid}/delivery-schedule")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(DeliveryScheduleDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetDeliverySchedule(Guid cityId, CancellationToken ct)
    {
        var schedule = await _mediator.Send(new GetCityDeliveryScheduleQuery(cityId), ct);
        return schedule is null ? NotFound() : Ok(schedule);
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
    [ProducesResponseType(typeof(IReadOnlyList<CityDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken ct)
        => Ok(await _mediator.Send(new GetCitiesQuery(), ct));

    // ── GET /api/cities/deleted  (Admin) ──────────────────────────────────────
    /// <summary>Returns soft-deleted cities so an admin can reactivate them.</summary>
    [HttpGet("deleted")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IReadOnlyList<CityDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDeletedCities(CancellationToken ct)
        => Ok(await _mediator.Send(new GetCitiesQuery(Deleted: true), ct));

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
    [ProducesResponseType(typeof(IReadOnlyList<DistrictDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetDistricts(Guid cityId, CancellationToken ct)
    {
        var districts = await _mediator.Send(new GetDistrictsQuery(cityId), ct);
        return districts is null ? NotFound() : Ok(districts);
    }

    // ── GET /api/cities/{cityId}/districts/deleted  (Admin) ───────────────────
    /// <summary>Returns soft-deleted districts of a city so an admin can reactivate them.</summary>
    [HttpGet("{cityId:guid}/districts/deleted")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IReadOnlyList<DistrictDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDeletedDistricts(Guid cityId, CancellationToken ct)
        => Ok(await _mediator.Send(new GetDistrictsQuery(cityId, Deleted: true), ct));

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
public sealed record SetDeliveryScheduleRequest(bool Monday, bool Tuesday, bool Wednesday, bool Thursday, bool Friday, bool Saturday, bool Sunday);
public sealed record SetDistrictServicePriceRequest(decimal? Price);
public sealed record SetDistrictTerritoryRequest(bool IsCapitalTerritory, bool IsCityTerritory);
public sealed record CreateCityRequest(string CityName, string? CityNameGeo);
public sealed record EditCityRequest(string CityName, string? CityNameGeo);
public sealed record CreateDistrictRequest(string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice, bool IsCapitalTerritory = false, bool IsCityTerritory = false);
public sealed record EditDistrictRequest(string DistrictName, string? DistrictNameGeo, decimal? CompanyServicePrice, bool IsCapitalTerritory = false, bool IsCityTerritory = false);
