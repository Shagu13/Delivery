using API.Models.Orders;
using Application.Common.Models;
using Application.Courier.Queries;
using Application.Orders.Commands;
using Application.Orders.DTOs;
using Application.Orders.Queries.GetAllOrders;
using Application.Orders.Queries.GetCourierDailyDeliveries;
using Application.Orders.Queries.GetOrderByTrackingNumber;
using Application.Orders.Queries;
using Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace API.Controllers;

public sealed class OrdersController : BaseController
{
    // ── GET /api/orders  (Admin — all orders, filterable) ────────────────────
    [HttpGet]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(PagedResult<AdminOrderListDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? city       = null,
        [FromQuery] string? district   = null,
        [FromQuery] string? search     = null,
        [FromQuery] string? orderType  = null,
        [FromQuery] Guid?   courierId  = null,
        [FromQuery] bool    unpriced   = false,
        [FromQuery] bool    postponed  = false,
        [FromQuery] bool    activeOnly = false,
        [FromQuery] bool?   assigned   = null,
        [FromQuery] int     page       = 1,
        [FromQuery] int     pageSize   = 50,
        CancellationToken ct = default)
    {
        var result = await Sender.Send(
            new GetAllOrdersQuery(city, district, search, courierId, orderType, unpriced, activeOnly, postponed, page, pageSize, assigned), ct);
        return Ok(result);
    }

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

    // ── PUT /api/orders/{id}  (Admin — edit all fields) ──────────────────────
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> UpdateOrder(
        Guid id,
        [FromBody] UpdateOrderRequest request,
        CancellationToken ct)
    {
        if (!Enum.TryParse<ServicePayer>(request.WhoPaysForCompanyService, out var payer))
            return UnprocessableEntity("Invalid WhoPaysForCompanyService value.");

        if (!Enum.TryParse<PaymentStatus>(request.ProductPaymentStatus, out var payStatus))
            return UnprocessableEntity("Invalid ProductPaymentStatus value.");

        await Sender.Send(new UpdateOrderCommand(
            OrderId:                   id,
            RecipientFirstName:        request.RecipientFirstName,
            RecipientLastName:         request.RecipientLastName,
            RecipientPhone:            request.RecipientPhone,
            RecipientCity:             request.RecipientCity,
            RecipientDistrict:         request.RecipientDistrict,
            RecipientAddress:          request.RecipientAddress,
            Description:               request.Description,
            IsFragile:                 request.IsFragile,
            WhoPaysForCompanyService:  payer,
            ProductPaymentStatus:      payStatus,
            AmountToCollectForPackage: request.AmountToCollectForPackage,
            CompanyServicePrice:       request.CompanyServicePrice,
            CourierSalary:             request.CourierSalary
        ), ct);

        return NoContent();
    }

    // ── PUT /api/orders/{id}/my  (Customer — edit own package while Pending) ──
    [HttpPut("{id:guid}/my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> UpdateMyOrder(
        Guid id,
        [FromBody] CustomerUpdateOrderRequest request,
        CancellationToken ct)
    {
        var customerIdClaim = User.FindFirstValue("customerId");
        if (!Guid.TryParse(customerIdClaim, out var customerId))
            return Forbid();

        await Sender.Send(new UpdateOrderByCustomerCommand(
            OrderId:                   id,
            CustomerId:                customerId,
            RecipientFirstName:        request.RecipientFirstName,
            RecipientLastName:         request.RecipientLastName,
            RecipientPhone:            request.RecipientPhone,
            RecipientAddress:          request.RecipientAddress,
            AmountToCollectForPackage: request.AmountToCollectForPackage
        ), ct);

        return NoContent();
    }

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

    // ── PUT /api/orders/{id}/admin-mark-delivered  (Admin) ───────────────────
    [HttpPut("{id:guid}/admin-mark-delivered")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> AdminMarkDelivered(Guid id, CancellationToken ct)
    {
        await Sender.Send(new AdminMarkOrderDeliveredCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/admin-mark-at-warehouse  (Admin) ─────────────────
    [HttpPut("{id:guid}/admin-mark-at-warehouse")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> AdminMarkAtWarehouse(Guid id, CancellationToken ct)
    {
        await Sender.Send(new AdminMarkReturnDeliveredToWarehouseCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/cancel-by-admin  (Admin) ────────────────────────
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

    // ── GET /api/orders/courier/{courierId}/daily  (Admin) ────────────────────
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

    // ── PUT /api/orders/{id}/delivered  (Courier) ─────────────────────────────
    [HttpPut("{id:guid}/delivered")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkDelivered(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkOrderDeliveredCommand(id, userId), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/postpone  (Courier) ──────────────────────────────
    [HttpPut("{id:guid}/postpone")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Postpone(Guid id, [FromBody] PostponeOrderRequest request, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new PostponeOrderCommand(id, userId, request.Reason), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/retry-delivery  (Courier) ────────────────────────
    [HttpPut("{id:guid}/retry-delivery")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RetryDelivery(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new RetryDeliveryCommand(id, userId), ct);
        return NoContent();
    }

    [HttpGet("my-history")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(typeof(IReadOnlyList<CourierOrderHistoryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyDeliveryHistory(CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var result = await Sender.Send(new GetCourierDeliveryHistoryQuery(userId), ct);
        return Ok(result);
    }

    // ── GET /api/orders/return-exchange  (Admin) ──────────────────────────────
    [HttpGet("return-exchange")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<ReturnExchangeOrderDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetReturnExchangeOrders(CancellationToken ct)
    {
        var result = await Sender.Send(new GetReturnExchangeOrdersQuery(), ct);
        return Ok(result);
    }

    // ── PUT /api/orders/{id}/assign-return-courier  (Admin) ───────────────────
    [HttpPut("{id:guid}/assign-return-courier")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> AssignReturnCourier(
        Guid id,
        [FromBody] AssignCourierRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new AssignCourierToReturnOrderCommand(id, request.CourierId), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/return-picked-up  (Courier) ──────────────────────
    [HttpPut("{id:guid}/return-picked-up")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ReturnPickedUp(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkReturnPickedUpCommand(id, userId), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/return-delivered-warehouse  (Courier) ────────────
    [HttpPut("{id:guid}/return-delivered-warehouse")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ReturnDeliveredToWarehouse(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkReturnDeliveredToWarehouseCommand(id, userId), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/mark-returned-to-sender  (Admin) ─────────────────
    [HttpPut("{id:guid}/mark-returned-to-sender")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkReturnedToSender(Guid id, CancellationToken ct)
    {
        await Sender.Send(new MarkReturnedToSenderCommand(id), ct);
        return NoContent();
    }
}

// ── Request models ────────────────────────────────────────────────────────────
public sealed record SetCourierSalaryRequest(decimal Salary);
public sealed record SetCompanyServicePriceRequest(decimal Price);
public sealed record PostponeOrderRequest(Domain.Enums.PostponeReason Reason);

public sealed record UpdateOrderRequest(
    string   RecipientFirstName,
    string   RecipientLastName,
    string   RecipientPhone,
    string   RecipientCity,
    string   RecipientDistrict,
    string   RecipientAddress,
    string?  Description,
    bool     IsFragile,
    string   WhoPaysForCompanyService,  // "Sender" | "Recipient"
    string   ProductPaymentStatus,      // "Paid" | "NotPaid"
    decimal? AmountToCollectForPackage,
    decimal  CompanyServicePrice,
    decimal? CourierSalary
);

public sealed record CustomerUpdateOrderRequest(
    string   RecipientFirstName,
    string   RecipientLastName,
    string   RecipientPhone,
    string   RecipientAddress,
    decimal? AmountToCollectForPackage
);
