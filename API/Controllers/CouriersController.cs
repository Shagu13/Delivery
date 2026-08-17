using API.Models.Couriers;
using Application.Couriers.Commands.CreateCourier;
using Application.Couriers.Commands.UpdateCourier;
using Application.Couriers.Commands.SetCourierActiveStatus;
using Application.Couriers.DTOs;
using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

// Authorization is per-method, not class-wide: every endpoint is Admin-only EXCEPT
// the GetAll roster read, which Operators also need (to populate the pickup-courier
// dropdown and the Delivery page's courier filter). A class-level [Authorize(Admin)]
// can't be loosened per-method (attributes combine with AND), so it lives per-action.
public sealed class CouriersController : BaseController
{
    // An order is "closed" once it has left the courier's hands for good — it stops
    // counting as something they currently hold on the day view.
    private static readonly OrderStatus[] ClosedOrderStatuses =
    [
        OrderStatus.DeliveredToRecipient,
        OrderStatus.ExchangeCompleted,
        OrderStatus.DeliveredReturnOrderToWarehouse,
        OrderStatus.ReturnedToSender,
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    ];

    // A batch the pickup courier will never collect — excluded from "still out on".
    private static readonly OrderStatus[] ClosedGroupOrderStatuses =
    [
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
        OrderStatus.AllDelivered,
    ];

    private readonly IAppDbContext _context;

    public CouriersController(IAppDbContext context)
    {
        _context = context;
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Operator")]
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
                Password: request.Password,
                DefaultSalary: request.DefaultSalary
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
    [Authorize(Roles = "Admin,Operator")]
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
                firstName = c.FirstName,
                lastName = c.LastName,
                fullName = $"{c.FirstName} {c.LastName}",
                username = c.ApplicationUser.UserName,
                assignedCity = c.AssignedCity,
                assignedDistrict = c.AssignedDistrict,
                phoneNumber = c.PhoneNumber,
                idNumber = c.IdNumber,
                isDeleted = c.DateDeleted != null,
                dateDeleted = c.DateDeleted,
                defaultSalary = c.DefaultSalary,
            })
            .ToListAsync(ct);

        return Ok(couriers);
    }

    [HttpGet("{id:guid}")]
    [Authorize(Roles = "Admin,Operator")]
    public IActionResult GetById(Guid id) => Ok(new { id });

    // ── GET /api/couriers/{id}/orders  (Admin) ────────────────────────────────
    /// <summary>Returns all orders ever assigned to this courier, regardless of status.</summary>
    // ── PUT /api/couriers/{id} (Admin) ─────────────────────────────────────────
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCourierRequest request, CancellationToken ct)
    {
        var newPassword = string.IsNullOrWhiteSpace(request.NewPassword) ? null : request.NewPassword;
        await Sender.Send(new UpdateCourierCommand(id, request.FirstName, request.LastName, request.Username, newPassword, request.PhoneNumber, request.IdNumber, request.DefaultSalary), ct);
        return NoContent();
    }

    // ── PATCH /api/couriers/{id}/active (Admin) ───────────────────────────────
    [HttpPatch("{id:guid}/active")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetActive(Guid id, [FromBody] SetCourierActiveStatusRequest request, CancellationToken ct)
    {
        await Sender.Send(new SetCourierActiveStatusCommand(id, request.IsActive), ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/orders")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetCourierOrders(Guid id, CancellationToken ct)
    {
        var exists = await _context.Couriers.AnyAsync(c => c.Id == id, ct);
        if (!exists) return NotFound();

        bool hideRevenue = User.IsInRole("Operator");
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
                // Company margin is internal — hidden from operators.
                companyRevenue          = hideRevenue ? (decimal?)null : o.CompanyRevenue,
                orderType               = o.OrderType.ToString(),
                deliveredAt             = o.DeliveredAt,
                deliveredToWarehouseAt  = o.DeliveredToWarehouseAt,
                createdAt               = o.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(orders);
    }

    // ── GET /api/couriers/assigned?date=YYYY-MM-DD  (Admin) ───────────────────
    /// <summary>
    /// Returns the orders that make up a courier's last-mile workload on the given
    /// Georgian calendar day, each tagged with its courierId. The admin UI groups
    /// the result by courier.
    ///
    /// Today  → everything the courier currently holds (assigned and not yet closed,
    ///          no matter which day it was assigned on) plus what they closed today,
    ///          so an order doesn't vanish from the list the moment it's delivered.
    /// Past   → only what was actually completed that day, dated by
    ///          DeliveredAt ?? DeliveredToWarehouseAt (Return orders finish at the
    ///          warehouse and never get a DeliveredAt).
    ///
    /// `date` is a Georgian wall-clock day key — timestamps are stored as Georgian
    /// wall-clock without an offset, so it compares directly against the columns.
    /// </summary>
    [HttpGet("assigned")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAssignedForDay(
        [FromQuery] DateTime date, CancellationToken ct)
    {
        DateTime day    = date.Date;
        DateTime dayEnd = day.AddDays(1);
        bool isToday    = day == CustomTime.Today;

        IQueryable<Order> query = _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId != null);

        // Half-open range rather than .Date == day: sargable, and a null completion
        // timestamp simply falls outside it.
        query = isToday
            ? query.Where(o => !ClosedOrderStatuses.Contains(o.Status)
                            || ((o.DeliveredAt ?? o.DeliveredToWarehouseAt) >= day
                             && (o.DeliveredAt ?? o.DeliveredToWarehouseAt) <  dayEnd))
            : query.Where(o => (o.DeliveredAt ?? o.DeliveredToWarehouseAt) >= day
                            && (o.DeliveredAt ?? o.DeliveredToWarehouseAt) <  dayEnd);

        bool hideRevenue = User.IsInRole("Operator");
        var orders = await query
            .OrderByDescending(o => o.AssignedToCourierAt)
            .Select(o => new
            {
                courierId               = o.CourierId,
                id                      = o.Id,
                trackingNumber          = o.TrackingNumber,
                // The owning store (sender) business name, via either ownership path.
                senderBusinessName      = o.GroupOrder != null && o.GroupOrder.Customer != null
                                            ? o.GroupOrder.Customer.BusinessName
                                            : (o.Customer != null ? o.Customer.BusinessName : ""),
                recipientName           = o.RecipientName,
                recipientPhone          = o.RecipientPhone,
                recipientCity           = o.RecipientCity,
                recipientDistrict       = o.RecipientDistrict,
                recipientAddress        = o.RecipientAddress,
                status                  = o.Status.ToString(),
                companyServicePrice     = o.CompanyServicePrice,
                amountToCollectForPackage = o.AmountToCollectForPackage,
                courierSalary           = o.CourierSalary,
                // Company margin is internal — hidden from operators.
                companyRevenue          = hideRevenue ? (decimal?)null : o.CompanyRevenue,
                orderType               = o.OrderType.ToString(),
                assignedToCourierAt     = o.AssignedToCourierAt,
                deliveredAt             = o.DeliveredAt,
                deliveredToWarehouseAt  = o.DeliveredToWarehouseAt,
                createdAt               = o.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(orders);
    }

    // ── GET /api/couriers/assigned-pickups?date=YYYY-MM-DD  (Admin) ───────────
    /// <summary>
    /// The pickup-leg mirror of <see cref="GetAssignedForDay"/>: group-order batches
    /// tagged with the courier who collects them, for one Georgian calendar day.
    ///
    /// Today → every batch the courier is still out on (assigned, not yet collected,
    ///         not cancelled) plus the batches they collected today.
    /// Past  → only the batches actually collected that day, dated by PickedUpAt.
    /// </summary>
    [HttpGet("assigned-pickups")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAssignedPickupsForDay(
        [FromQuery] DateTime date, CancellationToken ct)
    {
        DateTime day    = date.Date;
        DateTime dayEnd = day.AddDays(1);
        bool isToday    = day == CustomTime.Today;

        IQueryable<GroupOrder> query = _context.GroupOrders
            .AsNoTracking()
            .Where(g => g.CourierId != null);

        query = isToday
            ? query.Where(g => (g.PickedUpAt >= day && g.PickedUpAt < dayEnd)
                            || (g.PickedUpAt == null && !ClosedGroupOrderStatuses.Contains(g.Status)))
            : query.Where(g => g.PickedUpAt >= day && g.PickedUpAt < dayEnd);

        var pickups = await query
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