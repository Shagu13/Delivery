using API.Models.Orders;
using Application.Orders.Queries.GetOrderByTrackingNumber;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class OrdersController : BaseController
{
    /// <summary>
    /// Public — no login required.
    /// Looks up a parcel by its tracking number and returns its current status
    /// along with the full tracking event timeline.
    /// </summary>
    /// <param name="trackingNumber">The unique tracking number printed on the parcel label.</param>
    [HttpGet("track/{trackingNumber}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(TrackOrderResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Track(string trackingNumber, CancellationToken ct)
    {
        var result = await Sender.Send(
            new GetOrderByTrackingNumberQuery(trackingNumber.Trim().ToUpperInvariant()),
            ct);

        var response = new TrackOrderResponse(
            OrderId:                  result.OrderId,
            TrackingNumber:           result.TrackingNumber,
            Status:                   result.Status.ToString(),

            RecipientFirstName:       result.RecipientFirstName,
            RecipientLastName:        result.RecipientLastName,
            RecipientCity:            result.RecipientCity,
            RecipientDistrict:        result.RecipientDistrict,
            RecipientAddress:         result.RecipientAddress,

            CourierFullName:          result.CourierFullName,
            WarehouseName:            result.WarehouseName,

            CreatedAt:                result.CreatedAt,
            PickedUpFromWarehouseAt:  result.PickedUpFromWarehouseAt,
            DeliveredAt:              result.DeliveredAt,

            TrackingEvents: result.TrackingEvents
                .Select(e => new TrackingEventResponse(
                    Status:      e.Status,
                    Description: e.Description,
                    CreatedAt:   e.CreatedAt))
                .ToList()
        );

        return Ok(response);
    }
}
