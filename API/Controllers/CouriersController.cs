using API.Models.Couriers;
using Application.Couriers.Commands.CreateCourier;
using Application.Couriers.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[Authorize(Roles = "Admin")]
public sealed class CouriersController : BaseController
{
    /// <summary>
    /// Create a new courier account. Admin only.
    /// Creates both the Identity login (ApplicationUser) and the domain Courier entity.
    /// </summary>
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

    /// <summary>Get a single courier by ID. Full implementation coming in next step.</summary>
    [HttpGet("{id:guid}")]
    public IActionResult GetById(Guid id) => Ok(new { id });
}
