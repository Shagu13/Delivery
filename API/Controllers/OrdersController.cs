using API.Models.Orders;
using Application.Common.Models;
using Application.Courier.Queries;
using Application.Orders.Commands;
using Application.Orders.Commands.SoftDeletePackage;
using Application.Orders.DTOs;
using Application.Orders.Queries.GetAllOrders;
using Application.Orders.Queries.GetCourierDailyDeliveries;
using Application.Orders.Queries.GetOrderByTrackingNumber;
using Application.Orders.Queries.GetOrderLocations;
using Application.Orders.Queries;
using ClosedXML.Excel;
using Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using System.Security.Claims;

namespace API.Controllers;

public sealed class OrdersController : BaseController
{
    // ── GET /api/orders  (Admin — all orders; Operator — read-only; TenantAdmin — own tenant) ──
    [HttpGet]
    [Authorize(Roles = "Admin,Operator,TenantAdmin")]
    [ProducesResponseType(typeof(PagedResult<AdminOrderListDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? city       = null,
        [FromQuery] string? district   = null,
        [FromQuery] string? search     = null,
        [FromQuery] string? orderType  = null,
        [FromQuery] Guid?   courierId  = null,
        [FromQuery] string? party      = null,
        [FromQuery] bool    unpriced   = false,
        [FromQuery] bool    postponed  = false,
        [FromQuery] bool    activeOnly = false,
        [FromQuery] bool?   assigned   = null,
        [FromQuery] DateTime? date     = null,
        [FromQuery] DateTime? dateTo   = null,
        [FromQuery] int     page       = 1,
        [FromQuery] int     pageSize   = 50,
        CancellationToken ct = default)
    {
        // A tenant co-admin sees only their own tenant's orders (scope from the JWT claim).
        // Operators run the delivery flow but must not see internal company margin.
        var result = await Sender.Send(
            new GetAllOrdersQuery(city, district, search, courierId, party, orderType, unpriced, activeOnly, postponed, page, pageSize, assigned, date, dateTo, CurrentTenantId, HideCompanyRevenue: User.IsInRole("Operator")), ct);
        return Ok(result);
    }

    // ── GET /api/orders/locations  (Delivery page City/District filter options) ──
    // Distinct city/district pairs that actually appear in orders — only used locations,
    // complete across all pages. Scoped to the tenant and (optionally) the selected day.
    [HttpGet("locations")]
    [Authorize(Roles = "Admin,Operator,TenantAdmin")]
    [ProducesResponseType(typeof(List<OrderLocationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetLocations(
        [FromQuery] DateTime? date   = null,
        [FromQuery] DateTime? dateTo = null,
        CancellationToken ct = default)
    {
        var result = await Sender.Send(new GetOrderLocationsQuery(date, dateTo, CurrentTenantId), ct);
        return Ok(result);
    }

    // ── GET /api/orders/export  (Admin/Operator — Excel of all matching, or a selected subset) ──
    [HttpGet("export")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ExportExcel(
        [FromQuery] string? city      = null,
        [FromQuery] string? district  = null,
        [FromQuery] string? search    = null,
        [FromQuery] Guid?   courierId = null,
        [FromQuery] bool    unpriced  = false,
        [FromQuery] bool    activeOnly = false,
        [FromQuery] bool?   assigned  = null,
        [FromQuery] DateTime? date    = null,
        [FromQuery] DateTime? dateTo  = null,
        [FromQuery] string? ids       = null,   // comma-separated order ids → export just those
        CancellationToken ct = default)
    {
        // Reuse the list query (un-paged) so the export honors the exact same filters as
        // the Delivery page; then narrow to the selected ids when provided.
        var result = await Sender.Send(new GetAllOrdersQuery(
            city, district, search, courierId,
            OrderType: null, Unpriced: unpriced, ActiveOnly: activeOnly, Postponed: false,
            Page: 1, PageSize: int.MaxValue, Assigned: assigned, Date: date, DateTo: dateTo,
            TenantId: null, HideCompanyRevenue: User.IsInRole("Operator")), ct);

        IEnumerable<AdminOrderListDto> rows = result.Items;
        if (!string.IsNullOrWhiteSpace(ids))
        {
            var idSet = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                           .Select(s => Guid.TryParse(s, out var g) ? g : (Guid?)null)
                           .Where(g => g.HasValue).Select(g => g!.Value)
                           .ToHashSet();
            rows = rows.Where(o => idSet.Contains(o.Id));
        }

        // Cancelled orders never belong on a picking/delivery manifest, regardless of which
        // rows were selected or which filters are active — exclude them unconditionally.
        var cancelledStatuses = new[]
        {
            nameof(OrderStatus.CancelledByAdmin),
            nameof(OrderStatus.CancelledBySender),
            nameof(OrderStatus.OrderNotAccepted),
        };
        rows = rows.Where(o => !cancelledStatuses.Contains(o.Status));

        var list = rows.ToList();

        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("Orders");

        string[] headers =
        {
            "Tracking #", "Store / Sender", "Sender Phone", "Recipient", "Recipient Phone",
            "City", "District", "Address", "Type", "Status", "Paid",
            "COD ₾", "Service ₾", "Salary ₾", "Revenue ₾", "Courier", "Created", "Delivered",
        };
        for (int c = 0; c < headers.Length; c++)
            ws.Cell(1, c + 1).Value = headers[c];
        ws.Row(1).Style.Font.Bold = true;

        var row = 2;
        foreach (var o in list)
        {
            ws.Cell(row, 1).Value  = o.TrackingNumber;
            ws.Cell(row, 2).Value  = string.IsNullOrWhiteSpace(o.SenderBusinessName)
                ? $"{o.SenderFirstName} {o.SenderLastName}".Trim()
                : o.SenderBusinessName;
            ws.Cell(row, 3).Value  = o.SenderPhone;
            ws.Cell(row, 4).Value  = o.RecipientName;
            ws.Cell(row, 5).Value  = o.RecipientPhone;
            ws.Cell(row, 6).Value  = o.RecipientCity;
            ws.Cell(row, 7).Value  = o.RecipientDistrict;
            ws.Cell(row, 8).Value  = o.RecipientAddress;
            ws.Cell(row, 9).Value  = o.OrderType;
            ws.Cell(row, 10).Value = o.Status;
            ws.Cell(row, 11).Value = o.ProductPaymentStatus;
            // COD column = product COD plus, when the recipient pays the company service fee at
            // delivery, that fee too (OrderFinance.ExpectedCourierCash — the cash the courier
            // actually collects). Sender-pays orders are unaffected: this equals the plain COD.
            if (o.ExpectedCourierCash > 0m) ws.Cell(row, 12).Value = o.ExpectedCourierCash;
            ws.Cell(row, 13).Value = o.CompanyServicePrice;
            if (o.CourierSalary.HasValue)  ws.Cell(row, 14).Value = o.CourierSalary.Value;
            if (o.CompanyRevenue.HasValue) ws.Cell(row, 15).Value = o.CompanyRevenue.Value;
            ws.Cell(row, 16).Value = o.CourierFullName ?? string.Empty;
            ws.Cell(row, 17).Value = o.CreatedAt;
            ws.Cell(row, 17).Style.DateFormat.Format = "dd.mm";
            if (o.DeliveredAt.HasValue)
            {
                ws.Cell(row, 18).Value = o.DeliveredAt.Value;
                ws.Cell(row, 18).Style.DateFormat.Format = "dd.mm";
            }
            row++;
        }

        ws.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        var fileName = $"orders-{Domain.CustomTime.Now:yyyyMMdd-HHmm}.xlsx";
        return File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName);
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
            RecipientName:          result.RecipientName,
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

    // ── GET /api/orders/my-return-pickups  (Courier) ───────────────────────────
    // Standalone Return orders assigned to this courier, in pickup-phase statuses —
    // surfaced on the Pickups tab rather than Deliveries (see GetCourierReturnPickupsQuery).
    [HttpGet("my-return-pickups")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyReturnPickups(CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var result = await Sender.Send(new GetCourierReturnPickupsQuery(userId), ct);
        return Ok(result);
    }

    // ── PUT /api/orders/{id}  (Admin/Operator — edit all fields) ──────────────
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin,Operator")]
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
            RecipientName:             request.RecipientName,
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
            CourierSalary:             request.CourierSalary,
            IsCompanyServicePriceIncluded: request.IsCompanyServicePriceIncluded
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

        if (!Enum.TryParse<ServicePayer>(request.WhoPaysForCompanyService, out var payer))
            return UnprocessableEntity("Invalid WhoPaysForCompanyService value.");

        await Sender.Send(new UpdateOrderByCustomerCommand(
            OrderId:                   id,
            CustomerId:                customerId,
            RecipientName:             request.RecipientName,
            RecipientPhone:            request.RecipientPhone,
            RecipientAddress:          request.RecipientAddress,
            AmountToCollectForPackage: request.AmountToCollectForPackage,
            Description:               request.Description,
            WhoPaysForCompanyService:  payer
        ), ct);

        return NoContent();
    }

    // ── PUT /api/orders/{id}/my/cancel  (Customer — cancel own package) ───────
    [HttpPut("{id:guid}/my/cancel")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CancelMyOrder(Guid id, CancellationToken ct)
    {
        var customerIdClaim = User.FindFirstValue("customerId");
        if (!Guid.TryParse(customerIdClaim, out var customerId))
            return Forbid();

        await Sender.Send(new CancelOrderByCustomerCommand(id, customerId), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/send-to-city  (Admin/Operator) ──────────────────
    [HttpPut("{id:guid}/send-to-city")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SendToCity(Guid id, CancellationToken ct)
    {
        await Sender.Send(new SendOrderToCityCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/assign-courier  (Admin/Operator) ────────────────
    [HttpPut("{id:guid}/assign-courier")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> AssignCourier(
        Guid id,
        [FromBody] AssignCourierRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new AssignCourierToOrderCommand(id, request.CourierId), ct);
        return NoContent();
    }

    // ── POST /api/orders/bulk-assign-courier  (Admin/Operator) ───────────────
    // One request for the whole selection instead of one per order — a single DB
    // transaction and background-fired notifications, so bulk-assigning dozens of
    // orders doesn't take minutes. Order type (Send/Exchange vs standalone Return)
    // is resolved server-side, so a mixed selection is fine.
    [HttpPost("bulk-assign-courier")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(BulkAssignCourierResultDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> BulkAssignCourier(
        [FromBody] BulkAssignCourierRequest request,
        CancellationToken ct)
    {
        var result = await Sender.Send(
            new BulkAssignCourierToOrdersCommand(request.OrderIds, request.CourierId), ct);
        return Ok(result);
    }

    // ── PUT /api/orders/{id}/admin-mark-delivered  (Admin/Operator) ──────────
    [HttpPut("{id:guid}/admin-mark-delivered")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> AdminMarkDelivered(
        Guid id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] AdminMarkDeliveredRequest? request,
        CancellationToken ct)
    {
        await Sender.Send(new AdminMarkOrderDeliveredCommand(id, request?.CourierId, request?.Salary), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/admin-mark-at-warehouse  (Admin/Operator) ────────
    [HttpPut("{id:guid}/admin-mark-at-warehouse")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> AdminMarkAtWarehouse(Guid id, CancellationToken ct)
    {
        await Sender.Send(new AdminMarkReturnDeliveredToWarehouseCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/cancel-by-admin  (Admin) ────────────────────────
    // No body (or no reason) → plain, no-charge cancel. A (non-warehouse) reason →
    // "cancel & charge": bills the sender the service fee (the order must have reached a courier).
    [HttpPut("{id:guid}/cancel-by-admin")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CancelByAdmin(
        Guid id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] CancelByAdminRequest? request,
        CancellationToken ct)
    {
        await Sender.Send(new CancelOrderByAdminCommand(id, request?.Reason, request?.Comment), ct);
        return NoContent();
    }

    // ── DELETE /api/orders/{id}  (Admin) ────────────────────────────────────
    // Soft delete from the "Delete Package" page. Hides the order everywhere via the
    // global query filter; if it was the last live package in its batch the batch is
    // hidden too. Irreversible — no restore endpoint.
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SoftDelete(Guid id, CancellationToken ct)
    {
        await Sender.Send(new SoftDeleteOrderCommand(id), ct);
        return NoContent();
    }

    // ── POST /api/orders/bulk-delete  (Admin) ──────────────────────────────
    // Multi-select soft delete from the "Delete Package" page. Ids that no longer
    // resolve are returned in the result's NotFound list, not treated as failures.
    [HttpPost("bulk-delete")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(BulkSoftDeleteResultDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> BulkSoftDelete(
        [FromBody] BulkDeleteOrdersRequest request, CancellationToken ct)
    {
        BulkSoftDeleteResultDto result = await Sender.Send(
            new BulkSoftDeleteOrdersCommand(request.OrderIds), ct);
        return Ok(result);
    }

    // ── PUT /api/orders/{id}/admin-postpone  (Admin/Operator) ────────────────
    [HttpPut("{id:guid}/admin-postpone")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> AdminPostpone(
        Guid id, [FromBody] PostponeOrderRequest request, CancellationToken ct)
    {
        await Sender.Send(new AdminPostponeOrderCommand(id, request.Reason, request.Comment), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/mark-send-returned-to-sender  (Admin/Operator) ──
    [HttpPut("{id:guid}/mark-send-returned-to-sender")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> MarkSendReturnedToSender(Guid id, CancellationToken ct)
    {
        await Sender.Send(new MarkSendReturnedToSenderCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/mark-cancelled-returned-to-sender  (Admin/Operator) ──
    [HttpPut("{id:guid}/mark-cancelled-returned-to-sender")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> MarkCancelledReturnedToSender(Guid id, CancellationToken ct)
    {
        await Sender.Send(new MarkCancelledReturnedToSenderCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/correct-status  (Admin/Operator) ────────────────
    [HttpPut("{id:guid}/correct-status")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CorrectStatus(Guid id, [FromBody] CorrectStatusRequest request, CancellationToken ct)
    {
        await Sender.Send(new AdminCorrectOrderStatusCommand(id, request.Correction), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/courier-salary  (Admin/Operator) ─────────────────
    [HttpPut("{id:guid}/courier-salary")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetCourierSalary(
        Guid id,
        [FromBody] SetCourierSalaryRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new SetCourierSalaryCommand(id, request.Salary), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/company-service-price  (Admin/Operator) ──────────
    [HttpPut("{id:guid}/company-service-price")]
    [Authorize(Roles = "Admin,Operator")]
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

    // ── PUT /api/orders/{id}/delivered  (Courier) ─────────────────────────────
    [HttpPut("{id:guid}/delivered")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkDelivered(
        Guid id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] MarkDeliveredRequest? request,
        CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkOrderDeliveredCommand(id, userId, request?.UpdatedCodAmount), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/postpone  (Courier) ──────────────────────────────
    [HttpPut("{id:guid}/postpone")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Postpone(Guid id, [FromBody] PostponeOrderRequest request, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new PostponeOrderCommand(id, userId, request.Reason, request.Comment), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/delivered-paid-to-sender  (Courier) ──────────────
    [HttpPut("{id:guid}/delivered-paid-to-sender")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> DeliveredPaidToSender(Guid id, [FromBody] DeliveredPaidToSenderRequest request, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkOrderDeliveredPaidToSenderCommand(id, userId, request.ServiceFeeAlsoPaidToSender), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/cancel-delivery  (Courier) ───────────────────────
    [HttpPut("{id:guid}/cancel-delivery")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CancelDelivery(Guid id, [FromBody] CancelDeliveryRequest request, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new CancelOrderByCourierCommand(id, userId, request.Reason, request.Comment), ct);
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

    // ── GET /api/orders/return-exchange  (Admin/Operator) ─────────────────────
    [HttpGet("return-exchange")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IReadOnlyList<ReturnExchangeOrderDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetReturnExchangeOrders(CancellationToken ct)
    {
        var result = await Sender.Send(new GetReturnExchangeOrdersQuery(), ct);
        return Ok(result);
    }

    // ── PUT /api/orders/{id}/assign-return-courier  (Admin/Operator) ──────────
    [HttpPut("{id:guid}/assign-return-courier")]
    [Authorize(Roles = "Admin,Operator")]
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

    // ── PUT /api/orders/{id}/mark-returned-to-sender  (Admin/Operator) ────────
    [HttpPut("{id:guid}/mark-returned-to-sender")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkReturnedToSender(Guid id, CancellationToken ct)
    {
        await Sender.Send(new MarkReturnedToSenderCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/orders/{id}/set-return-status  (Admin/Operator) ──────────────
    // Free-form status override for a standalone Return order.
    [HttpPut("{id:guid}/set-return-status")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetReturnStatus(
        Guid id,
        [FromBody] SetReturnStatusRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new AdminSetReturnOrderStatusCommand(id, request.Status), ct);
        return NoContent();
    }
}

// ── Request models ────────────────────────────────────────────────────────────
public sealed record SetCourierSalaryRequest(decimal Salary);
/// <summary>Optional body for admin-mark-delivered: assign a courier when unassigned and/or set salary.</summary>
public sealed record AdminMarkDeliveredRequest(Guid? CourierId, decimal? Salary);
public sealed record SetCompanyServicePriceRequest(decimal Price);
public sealed record PostponeOrderRequest(Domain.Enums.PostponeReason Reason, string? Comment = null);
/// <summary>Optional correction to the parcel COD amount, applied atomically with delivery.</summary>
public sealed record MarkDeliveredRequest(decimal? UpdatedCodAmount);
public sealed record CancelDeliveryRequest(Domain.Enums.CancellationReason Reason, string? Comment);
/// <summary>Optional body for admin cancel: a reason makes it a billable "cancel &amp; charge"; omit for a plain cancel.</summary>
public sealed record CancelByAdminRequest(Domain.Enums.CancellationReason? Reason, string? Comment);
public sealed record DeliveredPaidToSenderRequest(bool ServiceFeeAlsoPaidToSender);
/// <summary>Admin override target status for a standalone Return order.</summary>
public sealed record SetReturnStatusRequest(Domain.Enums.OrderStatus Status);
/// <summary>Body for correct-status: which mistaken-status correction to apply.</summary>
public sealed record CorrectStatusRequest(Application.Orders.Commands.OrderStatusCorrection Correction);

public sealed record UpdateOrderRequest(
    string   RecipientName,
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
    decimal? CourierSalary,
    bool     IsCompanyServicePriceIncluded = false
);

public sealed record BulkAssignCourierRequest(IReadOnlyList<Guid> OrderIds, Guid CourierId);

public sealed record BulkDeleteOrdersRequest(IReadOnlyList<Guid> OrderIds);

public sealed record CustomerUpdateOrderRequest(
    string   RecipientName,
    string   RecipientPhone,
    string   RecipientAddress,
    decimal? AmountToCollectForPackage,
    string?  Description,
    string   WhoPaysForCompanyService  // "Sender" | "Recipient"
);
