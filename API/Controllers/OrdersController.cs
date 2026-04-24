using API.Models.Orders;
using Application.Courier.Queries;
using Application.Orders.Commands;
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
            OrderId:                 result.OrderId,
            TrackingNumber:          result.TrackingNumber,
            Status:                  result.Status.ToString(),
            RecipientFirstName:      result.RecipientFirstName,
            RecipientLastName:       result.RecipientLastName,
            RecipientCity:           result.RecipientCity,
            RecipientDistrict:       result.RecipientDistrict,
            RecipientAddress:        result.RecipientAddress,
            CourierFullName:         result.CourierFullName,
            WarehouseName:           result.WarehouseName,
            CreatedAt:               result.CreatedAt,
            PickedUpFromWarehouseAt: result.PickedUpFromWarehouseAt,
            DeliveredAt:             result.DeliveredAt,
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
    //  STATUS-TRANSITION ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════

    // ── PUT /api/orders/{id}/send-to-city  (Admin) ───────────────────────────
    /// <summary>Marks a non-Tbilisi order as dispatched to the recipient's city. No courier yet.</summary>
    [HttpPut("{id:guid}/send-to-city")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SendToCity(Guid id, CancellationToken ct)
    {
        await Sender.Send(new SendOrderToCityCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/assign-courier  (Admin) ─────────────────────────
    /// <summary>
    /// Assigns last-mile delivery courier.
    /// Valid from: AdminAcceptedOrderInWareHouse (Tbilisi) or OrderIsOnItsWayToRecipientsCity (other city).
    /// </summary>
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

    // ── PUT /api/orders/{id}/received  (Courier) ──────────────────────────────
    [HttpPut("{id:guid}/received")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkReceived(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkOrderReceivedCommand(id, userId), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/delivering  (Courier) ────────────────────────────
    [HttpPut("{id:guid}/delivering")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkDelivering(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkOrderDeliveringCommand(id, userId), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/delivered  (Courier) ────────────────────────────
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
