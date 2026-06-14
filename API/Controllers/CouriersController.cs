using API.Models.Couriers;
using Application.Couriers.Commands.CreateCourier;
using Application.Couriers.Commands.UpdateCourier;
using Application.Couriers.Commands.SetCourierActiveStatus;
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
                idNumber = c.IdNumber,
                isDeleted = c.DateDeleted != null,
                dateDeleted = c.DateDeleted,
            })
            .ToListAsync(ct);

        return Ok(couriers);
    }

    [HttpGet("{id:guid}")]
    public IActionResult GetById(Guid id) => Ok(new { id });

    // ── GET /api/couriers/{id}/orders  (Admin) ────────────────────────────────
    /// <summary>Returns all orders ever assigned to this courier, regardless of status.</summary>
    // ── PUT /api/couriers/{id} (Admin) ─────────────────────────────────────────
    [HttpPut("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCourierRequest request, CancellationToken ct)
    {
        var newPassword = string.IsNullOrWhiteSpace(request.NewPassword) ? null : request.NewPassword;
        await Sender.Send(new UpdateCourierCommand(id, request.Username, newPassword, request.PhoneNumber, request.IdNumber), ct);
        return NoContent();
    }

    // ── PATCH /api/couriers/{id}/active (Admin) ───────────────────────────────
    [HttpPatch("{id:guid}/active")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetActive(Guid id, [FromBody] SetCourierActiveStatusRequest request, CancellationToken ct)
    {
        await Sender.Send(new SetCourierActiveStatusCommand(id, request.IsActive), ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/orders")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetCourierOrders(Guid id, CancellationToken ct)
    {
        var exists = await _context.Couriers.AnyAsync(c => c.Id == id, ct);
        if (!exists) return NotFound();

        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == id)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new
            {
                id                      = o.Id,
                trackingNumber          = o.TrackingNumber,
                recipientName           = o.RecipientName,
                recipientPhone          = o.RecipientPhone,
                recipientCity           = o.RecipientCity,
                recipientDistrict       = o.RecipientDistrict,
                recipientAddress        = o.RecipientAddress,
                status                  = o.Status.ToString(),
                companyServicePrice     = o.CompanyServicePrice,
                courierSalary           = o.CourierSalary,
                companyRevenue          = o.CompanyRevenue,
                orderType               = o.OrderType.ToString(),
                deliveredAt             = o.DeliveredAt,
                deliveredToWarehouseAt  = o.DeliveredToWarehouseAt,
                createdAt               = o.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(orders);
    }

    // ── GET /api/couriers/assigned?from=ISO&to=ISO  (Admin) ───────────────────
    /// <summary>
    /// Returns every order assigned to a courier within [from, to) — regardless of
    /// whether it has been delivered yet — each tagged with its courierId. The
    /// caller (admin UI) passes the UTC bounds of a local calendar day and groups
    /// the result by courier to show what each courier was assigned that day.
    /// Dated by AssignedToCourierAt (the moment Order.CourierId was set).
    /// </summary>
    [HttpGet("assigned")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAssignedForRange(
        [FromQuery] DateTime from, [FromQuery] DateTime to, CancellationToken ct)
    {
        var fromUtc = from.ToUniversalTime();
        var toUtc   = to.ToUniversalTime();

        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId != null
                     && o.AssignedToCourierAt >= fromUtc
                     && o.AssignedToCourierAt <  toUtc)
            .OrderByDescending(o => o.AssignedToCourierAt)
            .Select(o => new
            {
                courierId               = o.CourierId,
                id                      = o.Id,
                trackingNumber          = o.TrackingNumber,
                recipientName           = o.RecipientName,
                recipientPhone          = o.RecipientPhone,
                recipientCity           = o.RecipientCity,
                recipientDistrict       = o.RecipientDistrict,
                recipientAddress        = o.RecipientAddress,
                status                  = o.Status.ToString(),
                companyServicePrice     = o.CompanyServicePrice,
                amountToCollectForPackage = o.AmountToCollectForPackage,
                courierSalary           = o.CourierSalary,
                companyRevenue          = o.CompanyRevenue,
                orderType               = o.OrderType.ToString(),
                assignedToCourierAt     = o.AssignedToCourierAt,
                deliveredAt             = o.DeliveredAt,
                deliveredToWarehouseAt  = o.DeliveredToWarehouseAt,
                createdAt               = o.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(orders);
    }

    // ── GET /api/couriers/assigned-pickups?from=ISO&to=ISO  (Admin) ───────────
    /// <summary>
    /// Returns every group-order pickup that was actually collected from the sender
    /// (PickedUpAt) within [from, to), each tagged with the courier who picked it up.
    /// The admin UI groups the result by courier to show which courier collected which
    /// batches — and how many single orders — on the chosen day. Mirrors
    /// GetAssignedForRange, but for the pickup (warehouse-collection) leg.
    /// </summary>
    [HttpGet("assigned-pickups")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAssignedPickupsForRange(
        [FromQuery] DateTime from, [FromQuery] DateTime to, CancellationToken ct)
    {
        var fromUtc = from.ToUniversalTime();
        var toUtc   = to.ToUniversalTime();

        var pickups = await _context.GroupOrders
            .AsNoTracking()
            .Where(g => g.CourierId != null
                     && g.PickedUpAt >= fromUtc
                     && g.PickedUpAt <  toUtc)
            .OrderByDescending(g => g.PickedUpAt)
            .Select(g => new
            {
                courierId          = g.CourierId,
                id                 = g.Id,
                senderBusinessName = g.SenderBusinessName,
                senderPhone        = g.SenderPhone,
                pickUpCity         = g.PickUpCity,
                pickUpDistrict     = g.PickUpDistrict,
                pickUpAddress      = g.PickUpAddress,
                numberOfPackages   = g.NumberOfPackages,
                status             = g.Status.ToString(),
                pickedUpAt         = g.PickedUpAt,
                createdAt          = g.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(pickups);
    }

}