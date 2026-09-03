using API.Models.GroupOrders;
using API.Models.Orders;
using Application.Common.Interfaces;
using Application.Common.Models;
using Application.Courier.Queries;
using Application.GroupOrders.Commands.AcceptGroupOrder;
using Application.GroupOrders.Commands.AcceptGroupOrderInWarehouse;
using Application.GroupOrders.Commands.AdminCreateWalkInOrder;
using Application.GroupOrders.Commands.AssignCourierToGroupOrder;
using Application.GroupOrders.Commands.CancelGroupOrder;
using Application.GroupOrders.Commands.CancelGroupOrderByAdmin;
using Application.GroupOrders.Commands.CourierGroupOrderActions;
using Application.GroupOrders.Commands.CreateGroupOrder;
using Application.GroupOrders.Commands.DeclineGroupOrder;
using Application.GroupOrders.Commands.RevertGroupOrderToPending;
using Application.GroupOrders.Commands.GroupAndAcceptStandaloneOrder;
using Application.GroupOrders.Commands.GroupAndWarehouseStandaloneOrder;
using Application.GroupOrders.Commands.SetGroupOrderPickupDate;
using Application.GroupOrders.DTOs;
using Application.GroupOrders.Queries.GetAllGroupOrders;
using Application.GroupOrders.Queries.GetCustomerGroupOrders;
using Application.GroupOrders.Queries.GetGroupOrderLocations;
using Application.Orders.Queries.GetOrderLocations;
using ClosedXML.Excel;
using Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace API.Controllers;

public sealed class GroupOrdersController : BaseController
{
    // ── POST /api/grouporders ────────────────────────────────────────────────
    [HttpPost]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(CreateGroupOrderResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Create(
    [FromBody] CreateGroupOrderRequest request,
    CancellationToken ct)
    {
        var customerIdClaim = User.FindFirstValue("customerId");
        if (!Guid.TryParse(customerIdClaim, out var customerId))
            return Forbid();

        var command = new CreateGroupOrderCommand(
            new CreateGroupOrderDto(
                SenderFirstName: request.SenderFirstName,
                SenderLastName: request.SenderLastName,
                SenderIdNumber: request.SenderIdNumber,
                SenderBusinessName: request.SenderBusinessName,
                SenderPhone: request.SenderPhone,
                AlternativeSenderPhone: request.AlternativeSenderPhone,
                PickUpCity: request.PickUpCity,
                PickUpDistrict: request.PickUpDistrict,
                PickUpAddress: request.PickUpAddress,
                Note: request.Note,
                Orders: MapOrders(request.Orders),
                CustomerId: customerId
            )
        );

        var result = await Sender.Send(command, ct);

        var response = new CreateGroupOrderResponse(
            GroupOrderId: result.GroupOrderId,
            SenderBusinessName: result.SenderBusinessName,
            Orders: result.Orders
                .Select(o => new OrderTrackingResponse(
                    o.OrderId,
                    o.TrackingNumber,
                    o.RecipientName))
                .ToList()
        );

        return CreatedAtAction(nameof(GetById), new { id = response.GroupOrderId }, response);
    }

    // ── POST /api/grouporders/checkout  (Customer places their cart) ──────────
    [HttpPost("checkout")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(CreateGroupOrderResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Checkout(
        [FromBody] CreateGroupOrderRequest request,
        CancellationToken ct)
    {
        var customerIdClaim = User.FindFirstValue("customerId");
        if (!Guid.TryParse(customerIdClaim, out var customerId))
            return Forbid();

        var command = new Application.GroupOrders.Commands.CheckoutCart.CheckoutCartCommand(
            new CreateGroupOrderDto(
                SenderFirstName: request.SenderFirstName,
                SenderLastName: request.SenderLastName,
                SenderIdNumber: request.SenderIdNumber,
                SenderBusinessName: request.SenderBusinessName,
                SenderPhone: request.SenderPhone,
                AlternativeSenderPhone: request.AlternativeSenderPhone,
                PickUpCity: request.PickUpCity,
                PickUpDistrict: request.PickUpDistrict,
                PickUpAddress: request.PickUpAddress,
                Note: request.Note,
                Orders: MapOrders(request.Orders),
                CustomerId: customerId
            ));

        var result = await Sender.Send(command, ct);

        var response = new CreateGroupOrderResponse(
            GroupOrderId: result.GroupOrderId,
            SenderBusinessName: result.SenderBusinessName,
            Orders: result.Orders
                .Select(o => new OrderTrackingResponse(o.OrderId, o.TrackingNumber, o.RecipientName))
                .ToList()
        );

        // GroupOrderId is Guid.Empty for a single standalone order — no batch to point at.
        return result.GroupOrderId == Guid.Empty
            ? Ok(response)
            : CreatedAtAction(nameof(GetById), new { id = response.GroupOrderId }, response);
    }

    // ── POST /api/grouporders/{id}/orders  (Customer adds packages to an open batch) ──
    [HttpPost("{id:guid}/orders")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(CreateGroupOrderResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> AddOrders(
        Guid id,
        [FromBody] AddOrdersToGroupOrderRequest request,
        CancellationToken ct)
    {
        var customerIdClaim = User.FindFirstValue("customerId");
        if (!Guid.TryParse(customerIdClaim, out var customerId))
            return Forbid();

        var result = await Sender.Send(
            new Application.GroupOrders.Commands.AddOrdersToGroupOrder.AddOrdersToGroupOrderCommand(
                GroupOrderId: id,
                CustomerId:   customerId,
                Orders:       MapOrders(request.Orders)),
            ct);

        var response = new CreateGroupOrderResponse(
            GroupOrderId: result.GroupOrderId,
            SenderBusinessName: result.SenderBusinessName,
            Orders: result.Orders
                .Select(o => new OrderTrackingResponse(o.OrderId, o.TrackingNumber, o.RecipientName))
                .ToList()
        );

        return Ok(response);
    }

    // ── POST /api/grouporders/walk-in  (Admin/Operator — office "Add Package" for a
    //    walk-in customer, with or without an account) ─────────────────────────────────
    [HttpPost("walk-in")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(CreateGroupOrderResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> CreateWalkInOrder(
        [FromBody] AdminCreateWalkInOrderRequest request,
        CancellationToken ct)
    {
        var command = new AdminCreateWalkInOrderCommand(
            new AdminCreateWalkInOrderDto(
                ExistingCustomerId: request.ExistingCustomerId,
                NewCustomer: request.NewCustomer is null
                    ? null
                    : new WalkInCustomerDto(
                        request.NewCustomer.FirstName,
                        request.NewCustomer.LastName,
                        request.NewCustomer.IdNumber,
                        request.NewCustomer.BusinessName,
                        request.NewCustomer.PhoneNumber,
                        request.NewCustomer.City,
                        request.NewCustomer.District,
                        request.NewCustomer.Address),
                Orders: MapOrders(request.Orders)));

        var result = await Sender.Send(command, ct);

        var response = new CreateGroupOrderResponse(
            GroupOrderId: result.GroupOrderId,
            SenderBusinessName: result.SenderBusinessName,
            Orders: result.Orders
                .Select(o => new OrderTrackingResponse(o.OrderId, o.TrackingNumber, o.RecipientName))
                .ToList()
        );

        return Ok(response);
    }

    // Shared mapping: HTTP order items → application CreateOrderDto.
    private static List<CreateOrderDto> MapOrders(IReadOnlyList<OrderItemRequest> orders) =>
        orders
            .Select(o => new CreateOrderDto(
                RecipientName:             o.RecipientName,
                RecipientPhone:            o.RecipientPhone,
                RecipientCity:             o.RecipientCity,
                RecipientDistrict:         o.RecipientDistrict,
                RecipientAddress:          o.RecipientAddress,
                Description:               o.Description,
                IsFragile:                 o.IsFragile,
                ProductPaymentStatus:      o.ProductPaymentStatus,
                WhoPaysForCompanyService:  o.WhoPaysForCompanyService,
                OrderType:                 o.OrderType,
                ReturnPickupAddress:       o.ReturnPickupAddress,
                ReturnPickupCity:          o.ReturnPickupCity,
                ReturnPickupDistrict:      o.ReturnPickupDistrict,
                AmountToCollectForPackage: o.AmountToCollectForPackage,
                CompanyServicePrice:       o.CompanyServicePrice,
                WeightPriceTierId:         o.WeightPriceTierId,
                Latitude:                  o.Latitude,
                Longitude:                 o.Longitude,
                IsCompanyServicePriceIncluded: o.IsCompanyServicePriceIncluded))
            .ToList();

    // ── GET /api/grouporders ─────────────────────────────────────────────────
    [HttpGet]
    [Authorize(Roles = "Admin,Operator,TenantAdmin")]
    [ProducesResponseType(typeof(PagedResult<AdminGroupOrderResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string?   search,
        [FromQuery] DateTime? date      = null,
        [FromQuery] DateTime? dateTo    = null,
        [FromQuery] string?   city      = null,   // comma-separated; any match (mirrors district)
        [FromQuery] string?   district  = null,   // comma-separated; any match
        [FromQuery] string    party     = "sender",
        [FromQuery] string?   status    = null,
        [FromQuery] Guid?     courierId = null,   // delivery courier (last-mile), any child order
        [FromQuery] bool      unpriced  = false,  // missing financials, any child order
        [FromQuery] bool      excludeCompleted = false,
        [FromQuery] int       page      = 1,
        [FromQuery] int       pageSize  = 30,
        [FromQuery] Guid?     customerId = null,  // owning customer (History page filter)
        CancellationToken ct = default)
    {
        // A tenant co-admin sees only their own tenant's batches, and never company revenue.
        // That query is a plain unbounded list — wrap it as a single-page PagedResult so the
        // response shape is consistent regardless of branch.
        if (CurrentTenantId is Guid tid)
        {
            var scoped = await Sender.Send(
                new Application.GroupOrders.Queries.GetTenantGroupOrders.GetTenantGroupOrdersQuery(tid), ct);
            var mapped = scoped.Select(go => MapToAdminResponse(go, includeRevenue: false)).ToList();
            return Ok(new PagedResult<AdminGroupOrderResponse>(mapped, mapped.Count, 1, Math.Max(mapped.Count, 1)));
        }

        var result = await Sender.Send(new GetAllGroupOrdersQuery(search, date, dateTo, city, district, party, status, courierId, unpriced, excludeCompleted, page, pageSize, customerId), ct);
        // Operators run the pick-up flow but must not see internal company revenue.
        bool includeRevenue = !User.IsInRole("Operator");
        var items = result.Items.Select(go => MapToAdminResponse(go, includeRevenue)).ToList();
        return Ok(new PagedResult<AdminGroupOrderResponse>(items, result.TotalCount, result.Page, result.PageSize));
    }

    // ── GET /api/grouporders/pickup-locations  (Packages page City/District filter options,
    //    sender/pickup side — recipient side reuses GET /api/orders/locations) ──────────
    [HttpGet("pickup-locations")]
    [Authorize(Roles = "Admin,Operator,TenantAdmin")]
    [ProducesResponseType(typeof(List<OrderLocationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPickupLocations(
        [FromQuery] DateTime? date   = null,
        [FromQuery] DateTime? dateTo = null,
        CancellationToken ct = default)
    {
        var result = await Sender.Send(new GetGroupOrderLocationsQuery(date, dateTo), ct);
        return Ok(result);
    }

    // ── GET /api/grouporders/pickup-day?date=  (Admin/Operator Pick-Up page summary) ───
    [HttpGet("pickup-day")]
    [Authorize(Roles = "Admin,Operator,TenantAdmin")]
    [ProducesResponseType(typeof(IReadOnlyList<Application.GroupOrders.DTOs.PickupDayCustomerDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPickupDay([FromQuery] DateTime date, CancellationToken ct)
    {
        // The day-grouping tools are dilo-only; a tenant co-admin gets nothing here.
        if (CurrentTenantId is not null)
            return Ok(Array.Empty<Application.GroupOrders.DTOs.PickupDayCustomerDto>());

        var result = await Sender.Send(
            new Application.GroupOrders.Queries.GetPickupDay.GetPickupDayQuery(date), ct);
        return Ok(result);
    }

    // ── GET /api/grouporders/customer-unattached?customerId=&date=  (grouping modal) ──
    [HttpGet("customer-unattached")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminOrderDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCustomerUnattached(
        [FromQuery] Guid customerId, [FromQuery] DateTime date, CancellationToken ct)
    {
        var result = await Sender.Send(
            new Application.GroupOrders.Queries.GetCustomerUnattachedOrders.GetCustomerUnattachedOrdersQuery(
                customerId, date), ct);
        return Ok(result);
    }

    // ── GET /api/grouporders/export  (Admin/Operator — Excel of the Packages page's current
    //    filters, or a selected subset of packages) ─────────────────────────────────────
    [HttpGet("export")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ExportExcel(
        [FromQuery] string?   search,
        [FromQuery] DateTime? date             = null,
        [FromQuery] DateTime? dateTo           = null,
        [FromQuery] string?   city             = null,
        [FromQuery] string?   district         = null,
        [FromQuery] string    party            = "sender",
        [FromQuery] string?   status           = null,
        [FromQuery] Guid?     courierId        = null,
        [FromQuery] bool      unpriced         = false,
        [FromQuery] bool      excludeCompleted = false,
        [FromQuery] Guid?     customerId       = null,
        [FromQuery] string?   ids              = null,   // comma-separated order ids → export just those
        [FromQuery] string    lang             = "ka",
        CancellationToken ct = default)
    {
        // Reuse the list query (unpaged) so the export honors the exact same filters as
        // the Packages page; then narrow to the selected order ids when provided.
        var result = await Sender.Send(new GetAllGroupOrdersQuery(
            search, date, dateTo, city, district, party, status, courierId, unpriced,
            excludeCompleted, Page: 1, PageSize: int.MaxValue, CustomerId: customerId), ct);

        HashSet<Guid>? idSet = null;
        if (!string.IsNullOrWhiteSpace(ids))
        {
            idSet = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                       .Select(s => Guid.TryParse(s, out var g) ? g : (Guid?)null)
                       .Where(g => g.HasValue).Select(g => g!.Value)
                       .ToHashSet();
        }

        // Cancelled packages never belong on a picking/delivery manifest, regardless of which
        // rows were selected or which filters are active — exclude them unconditionally.
        var cancelledStatuses = new[]
        {
            OrderStatus.CancelledByAdmin,
            OrderStatus.CancelledBySender,
            OrderStatus.OrderNotAccepted,
        };

        var rows = result.Items
            .SelectMany(go =>
            {
                var senderName = string.IsNullOrWhiteSpace(go.SenderBusinessName)
                    ? $"{go.SenderFirstName} {go.SenderLastName}".Trim()
                    : go.SenderBusinessName;
                return go.Orders
                    .Where(o => (idSet == null || idSet.Contains(o.Id)) && !cancelledStatuses.Contains(o.Status))
                    .Select(o => (Sender: senderName, Order: o));
            })
            .OrderBy(r => r.Order.CreatedAt)
            .ToList();

        var isGeo = lang == "ka";

        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add(isGeo ? "ამანათები" : "Packages");

        string[] headers = isGeo
            ? new[] { "თარიღი", "გამგზავნი", "რეგიონი", "მისამართი", "მიმღები", "აღწერა/კომენტარი", "საკონტაქტო", "ასაღები თანხა", "საკურიერო" }
            : new[] { "Date", "Sender", "Region", "Address", "Recipient", "Description/Comment", "Phone", "COD", "Service Fee" };

        for (int c = 0; c < headers.Length; c++)
            ws.Cell(1, c + 1).Value = headers[c];
        ws.Row(1).Style.Font.Bold = true;

        var row = 2;
        foreach (var (senderName, o) in rows)
        {
            ws.Cell(row, 1).Value = o.CreatedAt;
            ws.Cell(row, 1).Style.DateFormat.Format = "dd.mm";
            ws.Cell(row, 2).Value = senderName;
            ws.Cell(row, 3).Value = isGeo ? (o.RecipientDistrictGeo ?? o.RecipientDistrict) : o.RecipientDistrict;
            ws.Cell(row, 4).Value = o.RecipientAddress;
            ws.Cell(row, 5).Value = o.RecipientName;
            ws.Cell(row, 6).Value = o.Description ?? string.Empty;
            ws.Cell(row, 7).Value = o.RecipientPhone;
            // COD column = product COD plus, when the recipient pays the company service fee at
            // delivery, that fee too (OrderFinance.ExpectedCourierCash — the cash the courier
            // actually collects). Sender-pays orders are unaffected: this equals the plain COD.
            if (o.ExpectedCourierCash > 0m) ws.Cell(row, 8).Value = o.ExpectedCourierCash;
            ws.Cell(row, 9).Value = o.CompanyServicePrice;
            row++;
        }

        ws.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        var fileName = $"packages-{Domain.CustomTime.Now:yyyyMMdd-HHmm}.xlsx";
        return File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName);
    }

    // ── PUT /api/grouporders/attach  (Admin links unattached orders to a batch) ──
    [HttpPut("attach")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(CreateGroupOrderResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> AttachOrders(
        [FromBody] AttachOrdersRequest request, CancellationToken ct)
    {
        var result = await Sender.Send(
            new Application.GroupOrders.Commands.AttachOrdersToGroupOrder.AttachOrdersToGroupOrderCommand(
                CustomerId:         request.CustomerId,
                Date:               request.Date,
                OrderIds:           request.OrderIds,
                TargetGroupOrderId: request.TargetGroupOrderId), ct);

        var response = new CreateGroupOrderResponse(
            GroupOrderId: result.GroupOrderId,
            SenderBusinessName: result.SenderBusinessName,
            Orders: result.Orders
                .Select(o => new OrderTrackingResponse(o.OrderId, o.TrackingNumber, o.RecipientName))
                .ToList());

        return Ok(response);
    }

    // ── PUT /api/grouporders/merge  (Admin unites a customer's same-day batches) ──
    [HttpPut("merge")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(CreateGroupOrderResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> MergeGroupOrders(
        [FromBody] MergeGroupOrdersRequest request, CancellationToken ct)
    {
        var result = await Sender.Send(
            new Application.GroupOrders.Commands.MergeGroupOrders.MergeGroupOrdersCommand(
                TargetGroupOrderId:  request.TargetGroupOrderId,
                SourceGroupOrderIds: request.SourceGroupOrderIds), ct);

        var response = new CreateGroupOrderResponse(
            GroupOrderId: result.GroupOrderId,
            SenderBusinessName: result.SenderBusinessName,
            Orders: result.Orders
                .Select(o => new OrderTrackingResponse(o.OrderId, o.TrackingNumber, o.RecipientName))
                .ToList());

        return Ok(response);
    }

    // ── PUT /api/grouporders/move-order  (Admin moves one order between batches) ──
    [HttpPut("move-order")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> MoveOrder(
        [FromBody] MoveOrderRequest request, CancellationToken ct)
    {
        await Sender.Send(
            new Application.GroupOrders.Commands.MoveOrderToGroupOrder.MoveOrderToGroupOrderCommand(
                OrderId:            request.OrderId,
                TargetGroupOrderId: request.TargetGroupOrderId), ct);
        return NoContent();
    }

    // ── GET /api/grouporders/{id} ────────────────────────────────────────────
    [HttpGet("{id:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(AdminGroupOrderResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var go = await Sender.Send(new Application.GroupOrders.Queries.GetGroupOrderById.GetGroupOrderByIdQuery(id), ct);
        if (go is null) return NotFound();
        return Ok(MapToAdminResponse(go));
    }

    // ── GET /api/grouporders/my-pickups  (Courier) ───────────────────────────
    [HttpGet("my-pickups")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(typeof(IReadOnlyList<GroupOrderResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyPickups(CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var result = await Sender.Send(new GetCourierGroupOrdersQuery(userId), ct);
        return Ok(result);
    }

    // ── GET /api/grouporders/my  (Customer) ──────────────────────────────────
    [HttpGet("my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminGroupOrderResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMy(CancellationToken ct)
    {
        var customerIdClaim = User.FindFirstValue("customerId");
        if (!Guid.TryParse(customerIdClaim, out var customerId))
            return Forbid();

        var result = await Sender.Send(new GetCustomerGroupOrdersQuery(customerId), ct);
        // Customers must not see internal company revenue/margin.
        return Ok(result.Select(go => MapToAdminResponse(go, includeRevenue: false)).ToList());
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STATUS-TRANSITION ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════

    [HttpPut("{id:guid}/accept")]
    [Authorize(Roles = "Admin,Operator,TenantAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Accept(Guid id, CancellationToken ct)
    {
        // A tenant co-admin may only accept their own tenant's batches (ownership-guarded).
        if (CurrentTenantId is Guid tid)
            await Sender.Send(new Application.GroupOrders.Commands.AcceptTenantGroupOrder.AcceptTenantGroupOrderCommand(id, tid), ct);
        else
            await Sender.Send(new AcceptGroupOrderCommand(id), ct);
        return NoContent();
    }

    // Group a standalone order (GroupOrderId == null) into a batch and accept it in one step.
    // {id} is the standalone Order's id. Returns the resulting batch id.
    [HttpPut("standalone/{id:guid}/group-and-accept")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> GroupAndAcceptStandalone(
        Guid id, [FromQuery] Guid? targetGroupOrderId, CancellationToken ct)
    {
        var groupOrderId = await Sender.Send(new GroupAndAcceptStandaloneOrderCommand(id, targetGroupOrderId), ct);
        return Ok(new { groupOrderId });
    }

    // Group a standalone order into a batch (chosen or new), record the pickup courier on
    // the batch, and mark it in the warehouse — all in one step. {id} is the Order's id.
    [HttpPut("standalone/{id:guid}/group-and-warehouse")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> GroupAndWarehouseStandalone(
        Guid id, [FromQuery] Guid? targetGroupOrderId, [FromQuery] Guid? courierId, CancellationToken ct)
    {
        var groupOrderId = await Sender.Send(
            new GroupAndWarehouseStandaloneOrderCommand(id, targetGroupOrderId, courierId), ct);
        return Ok(new { groupOrderId });
    }

    [HttpPut("{id:guid}/decline")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Decline(Guid id, CancellationToken ct)
    {
        await Sender.Send(new DeclineGroupOrderCommand(id), ct);
        return NoContent();
    }

    // Undo an accidental Accept (AcceptedGroupOrder) or warehouse-accept
    // (AdminAcceptedOrderInWareHouse) — see RevertGroupOrderToPendingCommandHandler.
    [HttpPut("{id:guid}/revert-to-pending")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RevertToPending(Guid id, CancellationToken ct)
    {
        await Sender.Send(new RevertGroupOrderToPendingCommand(id), ct);
        return NoContent();
    }

    [HttpPut("{id:guid}/assign-courier")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> AssignCourier(
        Guid id,
        [FromBody] AssignCourierRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new AssignCourierToGroupOrderCommand(id, request.CourierId), ct);
        return NoContent();
    }

    // ── POST /api/grouporders/bulk-assign-courier  (Admin/Operator) ──────────
    // Pickup-leg mirror of OrdersController's bulk-assign-courier — one request for the
    // whole selection instead of one per batch.
    [HttpPost("bulk-assign-courier")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(BulkAssignCourierToGroupOrdersResultDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> BulkAssignCourier(
        [FromBody] BulkAssignCourierToGroupOrdersRequest request,
        CancellationToken ct)
    {
        var result = await Sender.Send(
            new BulkAssignCourierToGroupOrdersCommand(request.GroupOrderIds, request.CourierId), ct);
        return Ok(result);
    }

    [HttpPut("{id:guid}/accept-in-warehouse")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> AcceptInWarehouse(
        Guid id,
        [FromBody] AcceptInWarehouseRequest? request,
        CancellationToken ct)
    {
        await Sender.Send(new AcceptGroupOrderInWarehouseCommand(id, request?.PresentOrderIds), ct);
        return NoContent();
    }

    // ── PUT /api/grouporders/{id}/cancel  (Customer cancels their own) ────────
    [HttpPut("{id:guid}/cancel")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        var customerIdClaim = User.FindFirstValue("customerId");
        if (!Guid.TryParse(customerIdClaim, out var customerId))
            return Forbid();

        await Sender.Send(new CancelGroupOrderCommand(id, customerId), ct);
        return NoContent();
    }

    // ── PUT /api/grouporders/{id}/cancel-by-admin  (Admin/Operator — always available) ─
    [HttpPut("{id:guid}/cancel-by-admin")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CancelByAdmin(Guid id, CancellationToken ct)
    {
        await Sender.Send(new CancelGroupOrderByAdminCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/grouporders/{id}/pickup-date  (Admin/Operator sets scheduled pickup date) ─
    [HttpPut("{id:guid}/pickup-date")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetPickupDate(
        Guid id,
        [FromBody] SetPickupDateRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new SetGroupOrderPickupDateCommand(id, request.PickupDate), ct);
        return NoContent();
    }

    // ── PUT /api/grouporders/{id}  (Admin/Operator — edit sender + pickup info) ──
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> UpdateGroupOrder(
        Guid id,
        [FromBody] UpdateGroupOrderRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new Application.GroupOrders.Commands.UpdateGroupOrder.UpdateGroupOrderCommand(
            GroupOrderId:      id,
            SenderFirstName:   request.SenderFirstName,
            SenderLastName:    request.SenderLastName,
            SenderIdNumber:    request.SenderIdNumber,
            SenderBusinessName:request.SenderBusinessName,
            SenderPhone:       request.SenderPhone,
            PickUpCity:        request.PickUpCity,
            PickUpDistrict:    request.PickUpDistrict,
            PickUpAddress:     request.PickUpAddress,
            Note:              request.Note
        ), ct);
        return NoContent();
    }


    // ── Courier endpoints ──────────────────────────────────────────────────────
    [HttpPut("{id:guid}/picked-up")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkPickedUp(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkPickedUpCommand(id, userId), ct);
        return NoContent();
    }

    [HttpPut("{id:guid}/delivered-to-warehouse")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkDeliveredToWarehouse(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkDeliveredToWarehouseCommand(id, userId), ct);
        return NoContent();
    }

    [HttpGet("my-pickup-history")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(typeof(IReadOnlyList<CourierPickupHistoryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyPickupHistory(CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var result = await Sender.Send(new GetCourierPickupHistoryQuery(userId), ct);
        return Ok(result);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  EXCEL / TEMPLATE ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════

    [HttpGet("excel-template")]
    [AllowAnonymous]
    public async Task<IActionResult> DownloadTemplate(
        [FromQuery] string lang,
        CancellationToken ct)
    {
        bool isGeo = string.Equals(lang, "ka", StringComparison.OrdinalIgnoreCase);

        var db = HttpContext.RequestServices.GetRequiredService<IAppDbContext>();

        // ── Load cities + districts from DB ───────────────────────────────────
        var cities = await db.Cities
            .AsNoTracking()
            .Where(c => c.DateDeleted == null)
            .OrderBy(c => c.CityName)
            .Select(c => new
            {
                c.CityName,
                c.CityNameGeo,
                Districts = c.Districts
                    .Where(d => d.DateDeleted == null)
                    .OrderBy(d => d.DistrictName)
                    .Select(d => new { d.DistrictName, d.DistrictNameGeo, d.IsCapitalTerritory })
                    .ToList()
            })
            .ToListAsync(ct);

        // Active weight-price tiers drive the optional "Weight tier" dropdown column.
        var tiers = await db.WeightPriceTiers
            .AsNoTracking()
            .Where(t => t.DateDeleted == null)
            .OrderBy(t => t.MinWeightKg).ThenBy(t => t.MaxWeightKg)
            .Select(t => new { t.Label, t.MinWeightKg, t.MaxWeightKg })
            .ToListAsync(ct);

        using var workbook = new XLWorkbook();

        // ── Hidden Data sheet ─────────────────────────────────────────────────
        var wsData = workbook.Worksheets.Add("Data");
        wsData.Visibility = XLWorksheetVisibility.Hidden;

        wsData.Cell(1, 1).Value = "Cities";
        for (int i = 0; i < cities.Count; i++)
        {
            var displayName = isGeo && !string.IsNullOrWhiteSpace(cities[i].CityNameGeo)
                ? cities[i].CityNameGeo!
                : cities[i].CityName;
            wsData.Cell(i + 2, 1).Value = displayName;
        }

        var cityTableRange = wsData.Range(1, 1, cities.Count + 1, 1);
        cityTableRange.AsTable("T_CityList");
        workbook.DefinedNames.Add("CityList", wsData.Range(2, 1, cities.Count + 1, 1));

        for (int col = 0; col < cities.Count; col++)
        {
            var city = cities[col];
            int excelCol = col + 2;

            wsData.Cell(1, excelCol).Value = city.CityName;

            // Name the district range by the city's position in the list, not its
            // text. The dependent dropdown maps the selected city → this name via
            // MATCH (see below), so it works for any script (Georgian / Latin) and
            // sidesteps Excel's restrictions on characters in defined names.
            var rangeName = $"DIST_{col + 1}";
            var districts = city.Districts.Count > 0 ? city.Districts : null;

            if (districts is null)
            {
                var fallbackDisplay = isGeo && !string.IsNullOrWhiteSpace(city.CityNameGeo)
                    ? city.CityNameGeo!
                    : city.CityName;
                wsData.Cell(2, excelCol).Value = fallbackDisplay;
                var singleRange = wsData.Range(1, excelCol, 2, excelCol);
                singleRange.AsTable("T_" + rangeName);
                workbook.DefinedNames.Add(rangeName, wsData.Range(2, excelCol, 2, excelCol));
            }
            else
            {
                for (int row = 0; row < districts.Count; row++)
                {
                    var distDisplay = isGeo && !string.IsNullOrWhiteSpace(districts[row].DistrictNameGeo)
                        ? districts[row].DistrictNameGeo!
                        : districts[row].DistrictName;
                    wsData.Cell(row + 2, excelCol).Value = distDisplay;
                }

                var distTableRange = wsData.Range(1, excelCol, districts.Count + 1, excelCol);
                distTableRange.AsTable("T_" + rangeName);
                workbook.DefinedNames.Add(rangeName, wsData.Range(2, excelCol, districts.Count + 1, excelCol));
            }
        }

        // ── Payer option lists (for the "who pays" dependent dropdown) ────────
        // PayerBoth = Sender + Recipient (used when the parcel is paid);
        // PayerRecipient = Recipient only (used when the parcel is Not Paid).
        string senderLabel    = isGeo ? "გამგზავნი" : "Sender";
        string recipientLabel = isGeo ? "მიმღები"   : "Recipient";
        int payerBothCol      = cities.Count + 3;
        int payerRecipientCol = cities.Count + 4;

        wsData.Cell(1, payerBothCol).Value = "PayerBoth";
        wsData.Cell(2, payerBothCol).Value = senderLabel;
        wsData.Cell(3, payerBothCol).Value = recipientLabel;
        workbook.DefinedNames.Add("PayerBoth", wsData.Range(2, payerBothCol, 3, payerBothCol));

        wsData.Cell(1, payerRecipientCol).Value = "PayerRecipient";
        wsData.Cell(2, payerRecipientCol).Value = recipientLabel;
        workbook.DefinedNames.Add("PayerRecipient", wsData.Range(2, payerRecipientCol, 2, payerRecipientCol));

        // ── Weight tier option list (Standard + each active tier) ─────────────
        string standardTierLabel = isGeo ? "სტანდარტული" : "Standard";
        int tierListCol = cities.Count + 5;
        wsData.Cell(1, tierListCol).Value = "WeightTiers";
        wsData.Cell(2, tierListCol).Value = standardTierLabel;
        for (int i = 0; i < tiers.Count; i++)
            wsData.Cell(i + 3, tierListCol).Value =
                TierDisplay(tiers[i].Label, tiers[i].MinWeightKg, tiers[i].MaxWeightKg, isGeo);
        workbook.DefinedNames.Add("WeightTierList",
            wsData.Range(2, tierListCol, tiers.Count + 2, tierListCol));

        // ── Orders sheet ──────────────────────────────────────────────────────
        var ws = workbook.Worksheets.Add("Orders");

        string[] headers = isGeo
            ? [
                "მიმღების სახელი და გვარი",
                "მიმღების ტელეფონი",
                "ქალაქი",
                "რაიონი",
                "მისამართი",
                "აღწერა",
                "გადახდის სტატუსი",
                "ვინ იხდის საკურიეროს",
                "მტვრევადია",
                    "ამანათის ფასი (₾)",
                    "საკურიეროს საფასური ფასშია",
                    "წონის ტარიფი"
              ]
            : [
                "RecipientName",
                "RecipientPhone",
                "RecipientCity",
                "RecipientDistrict",
                "RecipientAddress",
                "Description",
                "PaymentStatus",
                "WhoPaysForCourierFee",
                "IsFragile",
                "ParcelPrice (₾)",
                "ServiceIncludedInPrice",
                "WeightTier"
              ];

        bool[] required = [true, true, true, true, true, false, true, true, true, false, false, false];

        for (int i = 0; i < headers.Length; i++)
        {
            var cell = ws.Cell(1, i + 1);
            cell.Value = headers[i];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = required[i]
                ? XLColor.FromArgb(0x1A, 0x1A, 0x2E)
                : XLColor.FromArgb(0x6B, 0x65, 0x60);
        }

        // City + District are intentionally left BLANK in the sample row — the customer
        // must pick them from the cascading dropdowns. (A pre-filled City/District was left
        // unchanged by customers who only edited the name/address, so every imported order
        // silently inherited that default location.) The Create Order page rejects a blank
        // or invalid city/district per row, so a missing one can never slip through.
        if (isGeo)
        {
            ws.Cell(2, 1).Value = "ანა სმიტი";
            ws.Cell(2, 2).Value = "599123456";
            // cols 3 (city) + 4 (district) intentionally left blank — customer must choose
            ws.Cell(2, 5).Value = "პეკინის გამზ. 42";
            ws.Cell(2, 6).Value = "მტვრევადი – ფრთხილად";
            ws.Cell(2, 7).Value = "გადასახდელი";
            ws.Cell(2, 8).Value = "მიმღები";
            ws.Cell(2, 9).Value = "არა";
            ws.Cell(2, 10).Value = 45.00;
            ws.Cell(2, 11).Value = "არა";
            ws.Cell(2, 12).Value = standardTierLabel;
        }
        else
        {
            ws.Cell(2, 1).Value = "Ana Smith";
            ws.Cell(2, 2).Value = "599123456";
            // cols 3 (city) + 4 (district) intentionally left blank — customer must choose
            ws.Cell(2, 5).Value = "Pekini Ave 42";
            ws.Cell(2, 6).Value = "Fragile – handle with care";
            ws.Cell(2, 7).Value = "Not Paid";
            ws.Cell(2, 8).Value = "Recipient";
            ws.Cell(2, 9).Value = "No";
            ws.Cell(2, 10).Value = 45.00;
            ws.Cell(2, 11).Value = "No";
            ws.Cell(2, 12).Value = standardTierLabel;
        }

        // The row-2 example is a placeholder. Grey/italic it via CONDITIONAL
        // formatting that only applies while the cell still holds the sample text,
        // so the moment the user types their own value the cell reverts to the
        // normal black style and their data is clearly visible (a static grey
        // style would otherwise stick and make real entries look faint).
        var placeholderColor = XLColor.FromArgb(0xA8, 0xA1, 0x9A);
        foreach (var cell in ws.Row(2).CellsUsed())
        {
            var sample = cell.GetString();
            if (string.IsNullOrEmpty(sample)) continue;

            var whenSample = cell.AddConditionalFormat().WhenEquals(sample);
            whenSample.Font.Italic = true;
            whenSample.Font.FontColor = placeholderColor;
        }

        // ── City dropdown (C2:C500) ───────────────────────────────────────────
        var cityVal = ws.Range("C2:C500").CreateDataValidation();
        cityVal.List("CityList", true);
        cityVal.ShowErrorMessage = false;

        // ── District dependent dropdown (D2:D500) ─────────────────────────────
        for (int row = 2; row <= 500; row++)
        {
            var distVal = ws.Cell(row, 4).CreateDataValidation();
            // Map the selected city (C{row}) to its district range by position:
            // MATCH finds the city's index in CityList, giving the DIST_<n> name.
            // Every city — Tbilisi included — gets its own district dropdown (the
            // capital is no longer special-cased, matching the Create Order page's
            // two separate City + District fields).
            string distListFormula = $"INDIRECT(\"DIST_\"&MATCH(C{row},CityList,0))";

            distVal.List(distListFormula, true);
            distVal.ShowErrorMessage = true;
            distVal.ErrorTitle = isGeo ? "არასწორი რაიონი" : "Invalid District";
            distVal.ErrorMessage = isGeo
                ? "ჯერ აირჩიეთ ქალაქი, შემდეგ — რაიონი."
                : "Please select a city first, then choose a district.";
        }

        // ── Static dropdowns (G, I) ───────────────────────────────────────────
        string paymentOptions = isGeo ? "\"გადახდილი,გადასახდელი\"" : "\"Paid,Not Paid\"";
        string fragileOptions = isGeo ? "\"კი,არა\"" : "\"Yes,No\"";

        var paymentVal = ws.Range("G2:G500").CreateDataValidation();
        paymentVal.List(paymentOptions, true);
        paymentVal.ShowErrorMessage = true;
        paymentVal.ErrorTitle = isGeo ? "არასწორი მნიშვნელობა" : "Invalid value";
        paymentVal.ErrorMessage = isGeo ? "აირჩიეთ: გადახდილი ან გადასახდელი" : "Choose Paid or Not Paid";

        // ── "Who pays" dependent dropdown (H2:H500) ───────────────────────────
        // When the payment status (G) is "Not Paid", the recipient always pays
        // the courier fee, so the dropdown collapses to Recipient only. For paid
        // parcels both options are offered. (The importer also forces Recipient
        // on Not Paid rows, so the value is guaranteed even if left blank.)
        string notPaidLiteral = isGeo ? "გადასახდელი" : "Not Paid";
        for (int row = 2; row <= 500; row++)
        {
            var payerVal = ws.Cell(row, 8).CreateDataValidation();
            payerVal.List($"IF(G{row}=\"{notPaidLiteral}\",PayerRecipient,PayerBoth)", true);
            payerVal.ShowErrorMessage = true;
            payerVal.ErrorTitle = isGeo ? "არასწორი მნიშვნელობა" : "Invalid value";
            payerVal.ErrorMessage = isGeo
                ? "გადასახდელ ამანათზე იხდის მიმღები."
                : "For Not Paid parcels the recipient pays.";
        }

        var fragileVal = ws.Range("I2:I500").CreateDataValidation();
        fragileVal.List(fragileOptions, true);
        fragileVal.ShowErrorMessage = true;
        fragileVal.ErrorTitle = isGeo ? "არასწორი მნიშვნელობა" : "Invalid value";
        fragileVal.ErrorMessage = isGeo ? "აირჩიეთ: კი ან არა" : "Choose Yes or No";

        // ── "Service fee included in price" dropdown (K2:K500) ─────────────────
        var includedVal = ws.Range("K2:K500").CreateDataValidation();
        includedVal.List(fragileOptions, true);   // same Yes/No (კი/არა) option list
        includedVal.ShowErrorMessage = true;
        includedVal.ErrorTitle = isGeo ? "არასწორი მნიშვნელობა" : "Invalid value";
        includedVal.ErrorMessage = isGeo ? "აირჩიეთ: კი ან არა" : "Choose Yes or No";

        // ── "Weight tier" dropdown (L2:L500) ──────────────────────────────────
        // Optional: defaults to Standard (no tier). A chosen tier overrides pricing.
        var tierVal = ws.Range("L2:L500").CreateDataValidation();
        tierVal.List("WeightTierList", true);
        tierVal.ShowErrorMessage = false;

        ws.Columns().AdjustToContents();
        ws.SheetView.FreezeRows(1);

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);

        string fileName = isGeo ? "შეკვეთის-შაბლონი.xlsx" : "group-order-template.xlsx";

        return File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName);
    }

    [HttpPost("parse-excel")]
    [AllowAnonymous]
    public async Task<IActionResult> ParseExcel(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { title = "No file uploaded." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".xlsx")
            return BadRequest(new { title = "Only .xlsx files are supported." });

        // ── Load lookup tables from DB ────────────────────────────────────────
        var db = HttpContext.RequestServices.GetRequiredService<IAppDbContext>();

        // Build geo→English city map and geo→English district map
        var cities = await db.Cities
            .AsNoTracking()
            .Where(c => c.DateDeleted == null)
            .Select(c => new { c.CityName, c.CityNameGeo })
            .ToListAsync(ct);

        // cityGeoToEn: Georgian display name → English canonical name
        var cityGeoToEn = new Dictionary<string, string>(StringComparer.Ordinal);
        var cityEnSet   = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var c in cities)
        {
            cityEnSet.Add(c.CityName);
            if (!string.IsNullOrWhiteSpace(c.CityNameGeo))
                cityGeoToEn[c.CityNameGeo!] = c.CityName;
        }

        var districts = await db.Districts
            .AsNoTracking()
            .Where(d => d.DateDeleted == null)
            .Select(d => new { d.DistrictName, d.DistrictNameGeo })
            .ToListAsync(ct);

        var districtGeoToEn = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var d in districts)
        {
            if (!string.IsNullOrWhiteSpace(d.DistrictNameGeo))
                districtGeoToEn[d.DistrictNameGeo!] = d.DistrictName;
        }

        // Active weight tiers, indexed by their display label (both languages + bare
        // label) so a picked "Weight tier" cell maps back to the tier id on import.
        var tiers = await db.WeightPriceTiers
            .AsNoTracking()
            .Where(t => t.DateDeleted == null)
            .Select(t => new { t.Id, t.Label, t.MinWeightKg, t.MaxWeightKg })
            .ToListAsync(ct);

        var tierByDisplay = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        foreach (var tr in tiers)
        {
            tierByDisplay[TierDisplay(tr.Label, tr.MinWeightKg, tr.MaxWeightKg, isGeo: false)] = tr.Id;
            tierByDisplay[TierDisplay(tr.Label, tr.MinWeightKg, tr.MaxWeightKg, isGeo: true)]  = tr.Id;
            if (!string.IsNullOrWhiteSpace(tr.Label))
                tierByDisplay[tr.Label!.Trim()] = tr.Id;
        }

        // ── Parse file ────────────────────────────────────────────────────────
        using var stream = file.OpenReadStream();
        using var workbook = new XLWorkbook(stream);
        var ws = workbook.Worksheets.FirstOrDefault(s => s.Name == "Orders")
         ?? workbook.Worksheets.First();

        var orders = new List<OrderItemRequest>();
        int lastRow = ws.LastRowUsed()?.RowNumber() ?? 1;

        for (int row = 2; row <= lastRow; row++)
        {
            var recipientName = ws.Cell(row, 1).GetString().Trim();
            if (string.IsNullOrWhiteSpace(recipientName)) continue;

            // Skip the built-in sample row
            if (recipientName.Equals("Ana Smith", StringComparison.OrdinalIgnoreCase) ||
                recipientName.Equals("ანა სმიტი", StringComparison.Ordinal))
                continue;

            var description = ws.Cell(row, 6).GetString().Trim();
            var paymentRaw  = ws.Cell(row, 7).GetString().Trim();
            var payerRaw    = ws.Cell(row, 8).GetString().Trim();
            var fragileRaw  = ws.Cell(row, 9).GetString().Trim();

            // ── Col J: parcel price ───────────────────────────────────────────
            decimal? amountToCollect = null;
            var parcelPriceRaw = ws.Cell(row, 10).GetString().Trim();
            if (decimal.TryParse(parcelPriceRaw,
                System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture,
                out var parsedPrice) && parsedPrice > 0)
            {
                amountToCollect = parsedPrice;
            }

            var paymentStatus =
                paymentRaw.Equals("Paid", StringComparison.OrdinalIgnoreCase) ||
                paymentRaw.Equals("გადახდილი", StringComparison.Ordinal)
                    ? PaymentStatus.Paid
                    : PaymentStatus.NotPaid;

            // Unpaid (COD) parcels: the recipient always pays the courier fee, so
            // the payer is forced to Recipient regardless of the sheet value
            // (matches the web order form). Only paid parcels honour the column.
            var payer =
                paymentStatus == PaymentStatus.NotPaid
                    ? ServicePayer.Recipient
                    : payerRaw.Equals("Recipient", StringComparison.OrdinalIgnoreCase) ||
                      payerRaw.Equals("მიმღები", StringComparison.Ordinal)
                        ? ServicePayer.Recipient
                        : ServicePayer.Sender;

            var isFragile =
                fragileRaw.Equals("Yes", StringComparison.OrdinalIgnoreCase) ||
                fragileRaw.Equals("კი", StringComparison.Ordinal);

            // ── Col K: is the service fee already included in the parcel price? ──
            var includedRaw = ws.Cell(row, 11).GetString().Trim();
            var isServiceIncluded =
                includedRaw.Equals("Yes", StringComparison.OrdinalIgnoreCase) ||
                includedRaw.Equals("კი", StringComparison.Ordinal);

            // ── City / district: normalise geo names → English canonical ──────
            var cellCity     = ws.Cell(row, 3).GetString().Trim();
            var cellDistrict = ws.Cell(row, 4).GetString().Trim();

            // If the cell contains a Georgian name, map it to the English key.
            // If it's already English (or unrecognised), pass through as-is.
            var recipientCity     = cityGeoToEn.TryGetValue(cellCity, out var enCity)
                                        ? enCity : cellCity;
            var recipientDistrict = districtGeoToEn.TryGetValue(cellDistrict, out var enDist)
                                        ? enDist : cellDistrict;

            // ── Col L: weight tier ────────────────────────────────────────────
            // Blank or "Standard"/"სტანდარტული" → no tier (standard pricing).
            // Any other value maps back to a tier id; unrecognised text falls to null.
            Guid? weightPriceTierId = null;
            var tierRaw = ws.Cell(row, 12).GetString().Trim();
            if (!string.IsNullOrWhiteSpace(tierRaw)
                && !tierRaw.Equals("Standard", StringComparison.OrdinalIgnoreCase)
                && !tierRaw.Equals("სტანდარტული", StringComparison.Ordinal)
                && tierByDisplay.TryGetValue(tierRaw, out var matchedTierId))
            {
                weightPriceTierId = matchedTierId;
            }

            orders.Add(new OrderItemRequest(
                RecipientName: recipientName,
                RecipientPhone: ws.Cell(row, 2).GetString().Trim(),
                RecipientCity: recipientCity,
                RecipientDistrict: recipientDistrict,
                RecipientAddress: ws.Cell(row, 5).GetString().Trim(),
                Description: description.Length > 0 ? description : null,
                IsFragile: isFragile,
                ProductPaymentStatus: paymentStatus,
                WhoPaysForCompanyService: payer,
                AmountToCollectForPackage: amountToCollect,
                WeightPriceTierId: weightPriceTierId,
                // OrderType defaults to Send for Excel imports
                IsCompanyServicePriceIncluded: isServiceIncluded
            ));
        }

        if (orders.Count == 0)
            return BadRequest(new { title = "No valid rows found." });

        return Ok(orders);
    }

    // Human-readable weight-tier label shown in the Excel dropdown and matched back
    // on import. Uses the tier's own label when set, otherwise the weight range.
    // Kept identical between template generation and parsing so the round-trip matches.
    private static string TierDisplay(string? label, decimal min, decimal max, bool isGeo)
    {
        var ci = System.Globalization.CultureInfo.InvariantCulture;
        string range = $"{min.ToString("0.##", ci)}-{max.ToString("0.##", ci)} {(isGeo ? "კგ" : "kg")}";
        return string.IsNullOrWhiteSpace(label) ? range : $"{label!.Trim()} ({range})";
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Private mapper
    // ══════════════════════════════════════════════════════════════════════════
    internal static AdminGroupOrderResponse MapToAdminResponse(AdminGroupOrderDto go, bool includeRevenue = true) =>
        new(
            Id:                      go.Id,
            CreatedAt:               go.CreatedAt,
            Status:                  go.Status.ToString(),
            CustomerId:              go.CustomerId,
            SenderFirstName:         go.SenderFirstName,
            SenderLastName:          go.SenderLastName,
            SenderIdNumber:          go.SenderIdNumber,
            SenderBusinessName:      go.SenderBusinessName,
            SenderPhone:             go.SenderPhone,
            AlternativeSenderPhone:  go.AlternativeSenderPhone,
            PickUpCity:              go.PickUpCity,
            PickUpCityGeo:           go.PickUpCityGeo,
            PickUpDistrict:          go.PickUpDistrict,
            PickUpDistrictGeo:       go.PickUpDistrictGeo,
            PickUpAddress:           go.PickUpAddress,
            Note:                    go.Note,
            NumberOfPackages:        go.NumberOfPackages,
            WhenPackagePickedUpDate: go.WhenPackagePickedUpDate,
            CourierId:               go.CourierId,
            CourierFullName:         go.CourierFullName,
            CompanyServiceCapitalPrice:  go.CompanyServiceCapitalPrice,
            CompanyServiceCityPrice:     go.CompanyServiceCityPrice,
            CompanyServiceDistrictPrice: go.CompanyServiceDistrictPrice,
            CustomerSpecialPrices:   go.CustomerSpecialPrices,
            Orders: go.Orders.Select(o => new AdminOrderResponse(
                Id:                               o.Id,
                TrackingNumber:                   o.TrackingNumber,
                RecipientName:                    o.RecipientName,
                RecipientPhone:                   o.RecipientPhone,
                RecipientCity:                    o.RecipientCity,
                RecipientCityGeo:                 o.RecipientCityGeo,
                RecipientDistrict:                o.RecipientDistrict,
                RecipientDistrictGeo:             o.RecipientDistrictGeo,
                RecipientAddress:                 o.RecipientAddress,
                Description:                      o.Description,
                IsFragile:                        o.IsFragile,
                OrderType:                        o.OrderType.ToString(),
                ReturnPickupAddress:              o.ReturnPickupAddress,
                ReturnPickupCity:                 o.ReturnPickupCity,
                ReturnPickupDistrict:             o.ReturnPickupDistrict,
                Status:                           o.Status.ToString(),
                ProductPaymentStatus:             o.ProductPaymentStatus.ToString(),
                WhoPaysForCompanyService:         o.WhoPaysForCompanyService.ToString(),
                AmountToCollectForPackage:        o.AmountToCollectForPackage,
                AmountOfCashCollected:            o.AmountOfCashCollected,
                CourierSalary:                    o.CourierSalary,
                CompanyServicePrice:              o.CompanyServicePrice,
                IsCompanyServicePriceIncluded:    o.IsCompanyServicePriceIncluded,
                CompanyRevenue:                   includeRevenue ? o.CompanyRevenue : null,
                CourierId:                        o.CourierId,
                CreatedAt:                        o.CreatedAt,
                DeliveryDateFrom:                 o.DeliveryDateFrom,
                DeliveryDateTo:                   o.DeliveryDateTo,
                DeliveredAt:                      o.DeliveredAt,
                CancellationReason:               o.CancellationReason?.ToString(),
                CancellationComment:              o.CancellationComment,
                CancelledReturnedToSenderAt:      o.CancelledReturnedToSenderAt
            )).ToList(),
            IsStandalone: go.IsStandalone
        );
}

// ── Request models ────────────────────────────────────────────────────────────
public sealed record SetPickupDateRequest(DateTime PickupDate);

/// <summary>Body for POST /api/grouporders/bulk-assign-courier.</summary>
public sealed record BulkAssignCourierToGroupOrdersRequest(IReadOnlyList<Guid> GroupOrderIds, Guid CourierId);

/// <summary>Body for PUT /api/grouporders/{id}/accept-in-warehouse — the packages that
/// physically arrived. Omit (null) to accept the whole batch.</summary>
public sealed record AcceptInWarehouseRequest(IReadOnlyList<Guid>? PresentOrderIds);

/// <summary>Body for PUT /api/grouporders/attach — group a customer's unattached orders.</summary>
public sealed record AttachOrdersRequest(
    Guid CustomerId,
    DateTime Date,
    IReadOnlyList<Guid> OrderIds,
    Guid? TargetGroupOrderId = null
);

/// <summary>Body for PUT /api/grouporders/move-order — move one order to another batch.</summary>
public sealed record MoveOrderRequest(
    Guid OrderId,
    Guid TargetGroupOrderId
);

/// <summary>Body for PUT /api/grouporders/merge — merge chosen source batches into a target.</summary>
public sealed record MergeGroupOrdersRequest(
    Guid TargetGroupOrderId,
    IReadOnlyList<Guid> SourceGroupOrderIds
);

public sealed record UpdateGroupOrderRequest(
    string  SenderFirstName,
    string  SenderLastName,
    string? SenderIdNumber,
    string  SenderBusinessName,
    string  SenderPhone,
    string  PickUpCity,
    string  PickUpDistrict,
    string  PickUpAddress,
    string? Note
);
