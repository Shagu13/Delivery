using API.Models.Orders;
using Application.Courier.Queries;
using Application.Orders.Commands;
using Application.Orders.Queries.GetCourierDailyDeliveries;
using Application.Orders.Queries.GetOrderByTrackingNumber;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace API.Controllers;

public sealed class OrdersController : BaseController
{
    // ── GET /api/orders/track/{trackingNumber}  (Public) ─────────────────────
    [HttpGet("track/{trackingNumber}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(TrackOrderResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Track(string trackingNumber, CancellationToken ct)
    {
        var result = await Sender.Send(
            new GetOrderByTrackingNumberQuery(trackingNumber.Trim().ToUpperInvariant()), ct);

        var response = new TrackOrderResponse(
            OrderId:                result.OrderId,
            TrackingNumber:         result.TrackingNumber,
            Status:                 result.Status.ToString(),
            RecipientFirstName:     result.RecipientFirstName,
            RecipientLastName:      result.RecipientLastName,
            RecipientCity:          result.RecipientCity,
            RecipientDistrict:      result.RecipientDistrict,
            RecipientAddress:       result.RecipientAddress,
            IsFragile:              result.IsFragile,
            CourierFullName:        result.CourierFullName,
            WarehouseName:          result.WarehouseName,
            CreatedAt:              result.CreatedAt,
            PickedUpFromWarehouseAt: result.PickedUpFromWarehouseAt,
            DeliveredAt:            result.DeliveredAt,
            DeliveryDateFrom:       result.DeliveryDateFrom,
            DeliveryDateTo:         result.DeliveryDateTo,
            TrackingEvents: result.TrackingEvents
                .Select(e => new TrackingEventResponse(e.Status, e.Description, e.CreatedAt))
                .ToList()
        );

        return Ok(response);
    }

    // ── GET /api/orders/my-deliveries  (Courier) ──────────────────────────────
    [HttpGet("my-deliveries")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyDeliveries(CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var result = await Sender.Send(new GetCourierOrdersQuery(userId), ct);
        return Ok(result);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ADMIN STATUS-TRANSITION ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════

    // ── PUT /api/orders/{id}/send-to-city  (Admin) ───────────────────────────
    [HttpPut("{id:guid}/send-to-city")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SendToCity(Guid id, CancellationToken ct)
    {
        await Sender.Send(new SendOrderToCityCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/assign-courier  (Admin) ─────────────────────────
    [HttpPut("{id:guid}/assign-courier")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> AssignCourier(
        Guid id,
        [FromBody] AssignCourierRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new AssignCourierToOrderCommand(id, request.CourierId), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/cancel-by-admin  (Admin — available at any stage) ─
    [HttpPut("{id:guid}/cancel-by-admin")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CancelByAdmin(Guid id, CancellationToken ct)
    {
        await Sender.Send(new CancelOrderByAdminCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/courier-salary  (Admin) ──────────────────────────
    [HttpPut("{id:guid}/courier-salary")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetCourierSalary(
        Guid id,
        [FromBody] SetCourierSalaryRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new SetCourierSalaryCommand(id, request.Salary), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/company-service-price  (Admin) ───────────────────
    [HttpPut("{id:guid}/company-service-price")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetOrderCompanyServicePrice(
        Guid id,
        [FromBody] SetCompanyServicePriceRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new SetOrderCompanyServicePriceCommand(id, request.Price), ct);
        return NoContent();
    }

    // ── GET /api/orders/courier/{courierId}/daily?date=2026-04-30  (Admin) ────
    [HttpGet("courier/{courierId:guid}/daily")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(CourierDailyDeliveriesDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCourierDailyDeliveries(
        Guid courierId,
        [FromQuery] DateOnly date,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCourierDailyDeliveriesQuery(courierId, date), ct);
        return Ok(result);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  COURIER STATUS-TRANSITION ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════

    // ── PUT /api/orders/{id}/received  (Courier) ──────────────────────────────
    /// <summary>Courier confirms receipt of order. Auto-fills delivery window for non-Tbilisi.</summary>
    [HttpPut("{id:guid}/received")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkReceived(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkOrderReceivedCommand(id, userId), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/delivered  (Courier) ─────────────────────────────
    /// <summary>Courier marks delivery complete. Goes directly from CourierRecievedOrderToDeliver.</summary>
    [HttpPut("{id:guid}/delivered")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkDelivered(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkOrderDeliveredCommand(id, userId), ct);
        return NoContent();
    }
}

// ── Local request models ──────────────────────────────────────────────────────
public sealed record SetCourierSalaryRequest(decimal Salary);
public sealed record SetCompanyServicePriceRequest(decimal Price);
