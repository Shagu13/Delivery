using API.Models.Couriers;
using Application.Couriers.Commands.CreateCourier;
using Application.Couriers.DTOs;
using Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

[Authorize(Roles = "Admin")]
public sealed class CouriersController : BaseController
{
    private readonly IAppDbContext _context;

    public CouriersController(IAppDbContext context)
    {
        _context = context;
    }

    [HttpPost]
    [ProducesResponseType(typeof(CreateCourierResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Create(
        [FromBody] CreateCourierRequest request,
        CancellationToken ct)
    {
        var command = new CreateCourierCommand(
            new CreateCourierDto(
                FirstName: request.FirstName,
                LastName: request.LastName,
                IdNumber: request.IdNumber,
                PhoneNumber: request.PhoneNumber,
                AssignedCity: request.AssignedCity,
                AssignedDistrict: request.AssignedDistrict,
                Username: request.Username,
                Password: request.Password
            )
        );

        var courierId = await Sender.Send(command, ct);

        return CreatedAtAction(
            actionName: nameof(GetById),
            routeValues: new { id = courierId },
            value: new CreateCourierResponse(
                CourierId: courierId,
                Username: request.Username,
                FullName: $"{request.FirstName} {request.LastName}"
            ));
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var couriers = await _context.Couriers
            .AsNoTracking()
            .OrderBy(c => c.AssignedCity)
            .ThenBy(c => c.FirstName)
            .Select(c => new
            {
                courierId = c.Id,
                fullName = $"{c.FirstName} {c.LastName}",
                username = c.ApplicationUser.UserName,
                assignedCity = c.AssignedCity,
                assignedDistrict = c.AssignedDistrict,
                phoneNumber = c.PhoneNumber,
                isAvailable = c.IsAvailable,
            })
            .ToListAsync(ct);

        return Ok(couriers);
    }

    [HttpGet("{id:guid}")]
    public IActionResult GetById(Guid id) => Ok(new { id });
}