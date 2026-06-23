using API.Models.GroupOrders;
using API.Models.Orders;
using Application.Common.Interfaces;
using Application.Courier.Queries;
using Application.GroupOrders.Commands.AcceptGroupOrder;
using Application.GroupOrders.Commands.AcceptGroupOrderInWarehouse;
using Application.GroupOrders.Commands.AssignCourierToGroupOrder;
using Application.GroupOrders.Commands.CancelGroupOrder;
using Application.GroupOrders.Commands.CancelGroupOrderByAdmin;
using Application.GroupOrders.Commands.CourierGroupOrderActions;
using Application.GroupOrders.Commands.CreateGroupOrder;
using Application.GroupOrders.Commands.DeclineGroupOrder;
using Application.GroupOrders.Commands.GroupAndAcceptStandaloneOrder;
using Application.GroupOrders.Commands.GroupAndWarehouseStandaloneOrder;
using Application.GroupOrders.Commands.SetGroupOrderPickupDate;
using Application.GroupOrders.DTOs;
using Application.GroupOrders.Queries.GetAllGroupOrders;
using Application.GroupOrders.Queries.GetCustomerGroupOrders;
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
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminGroupOrderResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll([FromQuery] string? search, CancellationToken ct)
    {
        var result = await Sender.Send(new GetAllGroupOrdersQuery(search), ct);
        // Operators run the pick-up flow but must not see internal company revenue.
        bool includeRevenue = !User.IsInRole("Operator");
        return Ok(result.Select(go => MapToAdminResponse(go, includeRevenue)).ToList());
    }

    // ── GET /api/grouporders/pickup-day?date=  (Admin/Operator Pick-Up page summary) ───
    [HttpGet("pickup-day")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IReadOnlyList<Application.GroupOrders.DTOs.PickupDayCustomerDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPickupDay([FromQuery] DateTime date, CancellationToken ct)
    {
        var result = await Sender.Send(
            new Application.GroupOrders.Queries.GetPickupDay.GetPickupDayQuery(date), ct);
        return Ok(result);
    }

    // ── GET /api/grouporders/customer-unattached?customerId=&date=  (grouping modal) ──
    [HttpGet("customer-unattached")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminOrderDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCustomerUnattached(
        [FromQuery] Guid customerId, [FromQuery] DateTime date, CancellationToken ct)
    {
        var result = await Sender.Send(
            new Application.GroupOrders.Queries.GetCustomerUnattachedOrders.GetCustomerUnattachedOrdersQuery(
                customerId, date), ct);
        return Ok(result);
    }

    // ── PUT /api/grouporders/attach  (Admin links unattached orders to a batch) ──
    [HttpPut("attach")]
    [Authorize(Roles = "Admin")]
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
    [Authorize(Roles = "Admin")]
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
    [Authorize(Roles = "Admin")]
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
        var result = await Sender.Send(new GetAllGroupOrdersQuery(null), ct);
        var go = result.FirstOrDefault(x => x.Id == id);
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
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Accept(Guid id, CancellationToken ct)
    {
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
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Decline(Guid id, CancellationToken ct)
    {
        await Sender.Send(new DeclineGroupOrderCommand(id), ct);
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

    [HttpPut("{id:guid}/accept-in-warehouse")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> AcceptInWarehouse(Guid id, CancellationToken ct)
    {
        await Sender.Send(new AcceptGroupOrderInWarehouseCommand(id), ct);
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

    // ── PUT /api/grouporders/{id}/cancel-by-admin  (Admin — always available) ─
    [HttpPut("{id:guid}/cancel-by-admin")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CancelByAdmin(Guid id, CancellationToken ct)
    {
        await Sender.Send(new CancelGroupOrderByAdminCommand(id), ct);
        return NoContent();
    }

    // ── PUT /api/grouporders/{id}/pickup-date  (Admin sets scheduled pickup date) ─
    [HttpPut("{id:guid}/pickup-date")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetPickupDate(
        Guid id,
        [FromBody] SetPickupDateRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new SetGroupOrderPickupDateCommand(id, request.PickupDate), ct);
        return NoContent();
    }

    // ── PUT /api/grouporders/{id}  (Admin — edit sender + pickup info) ──────────
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
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
    [HttpPut("{id:guid}/picking-up")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> MarkPickingUp(Guid id, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await Sender.Send(new MarkPickingUpCommand(id, userId), ct);
        return NoContent();
    }

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

        // ── Empty district list (for capital cities) ──────────────────────────
        // The capital (e.g. Tbilisi) has no user-facing district choice — the
        // district dropdown points here (an empty cell) so nothing is offered and
        // nothing is required. Leaving the cell blank is accepted; the importer
        // resolves a capital-territory district for pricing on its own.
        int noDistrictCol = cities.Count + 5;
        wsData.Cell(1, noDistrictCol).Value = "NoDistrict";
        // row 2 intentionally left blank
        workbook.DefinedNames.Add("NoDistrict", wsData.Range(2, noDistrictCol, 2, noDistrictCol));

        // Display names of capital cities (those whose districts are capital
        // territory) for the current template language — used to blank out their
        // district dropdown below.
        var capitalCityNames = cities
            .Where(c => c.Districts.Any(d => d.IsCapitalTerritory))
            .Select(c => isGeo && !string.IsNullOrWhiteSpace(c.CityNameGeo) ? c.CityNameGeo! : c.CityName)
            .ToList();

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
                    "საკურიეროს საფასური ფასშია"
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
                "ServiceIncludedInPrice"
              ];

        bool[] required = [true, true, true, true, true, false, true, true, true, false, false];

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

        if (isGeo)
        {
            ws.Cell(2, 1).Value = "ანა სმიტი";
            ws.Cell(2, 2).Value = "599123456";
            ws.Cell(2, 3).Value = "თბილისი";
            // Capital: no district — leave the district cell blank on purpose.
            ws.Cell(2, 5).Value = "პეკინის გამზ. 42";
            ws.Cell(2, 6).Value = "მტვრევადი – ფრთხილად";
            ws.Cell(2, 7).Value = "გადასახდელი";
            ws.Cell(2, 8).Value = "მიმღები";
            ws.Cell(2, 9).Value = "არა";
            ws.Cell(2, 10).Value = 45.00;
            ws.Cell(2, 11).Value = "არა";
        }
        else
        {
            ws.Cell(2, 1).Value = "Ana Smith";
            ws.Cell(2, 2).Value = "599123456";
            ws.Cell(2, 3).Value = "Tbilisi";
            // Capital: no district — leave the district cell blank on purpose.
            ws.Cell(2, 5).Value = "Pekini Ave 42";
            ws.Cell(2, 6).Value = "Fragile – handle with care";
            ws.Cell(2, 7).Value = "Not Paid";
            ws.Cell(2, 8).Value = "Recipient";
            ws.Cell(2, 9).Value = "No";
            ws.Cell(2, 10).Value = 45.00;
            ws.Cell(2, 11).Value = "No";
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
            string distListFormula = $"INDIRECT(\"DIST_\"&MATCH(C{row},CityList,0))";

            // For the capital (e.g. Tbilisi) the district list collapses to the
            // empty NoDistrict range — nothing to choose, nothing required.
            if (capitalCityNames.Count > 0)
            {
                string cond = string.Join(",", capitalCityNames.Select(n => $"C{row}=\"{n}\""));
                string capitalTest = capitalCityNames.Count == 1 ? cond : $"OR({cond})";
                distListFormula = $"IF({capitalTest},NoDistrict,{distListFormula})";
            }

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

        // City (English) → a capital-territory district name. When a row's city is the
        // capital (Tbilisi) and the district cell is left blank, bind one of its
        // capital-territory districts so the order resolves to the capital price.
        var capitalDistrictByCity = await db.Districts
            .AsNoTracking()
            .Where(d => d.DateDeleted == null && d.IsCapitalTerritory)
            .GroupBy(d => d.City.CityName)
            .Select(g => new { CityName = g.Key, DistrictName = g.Min(d => d.DistrictName) })
            .ToDictionaryAsync(x => x.CityName, x => x.DistrictName!, StringComparer.OrdinalIgnoreCase, ct);

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

            // Capital city (Tbilisi): district is optional in the sheet. When left
            // blank, bind a capital-territory district so pricing still resolves.
            if (string.IsNullOrWhiteSpace(recipientDistrict) &&
                capitalDistrictByCity.TryGetValue(recipientCity, out var capitalDist))
            {
                recipientDistrict = capitalDist;
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
                WeightPriceTierId: null,
                // OrderType defaults to Send for Excel imports
                IsCompanyServicePriceIncluded: isServiceIncluded
            ));
        }

        if (orders.Count == 0)
            return BadRequest(new { title = "No valid rows found." });

        return Ok(orders);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Private mapper
    // ══════════════════════════════════════════════════════════════════════════
    private static AdminGroupOrderResponse MapToAdminResponse(AdminGroupOrderDto go, bool includeRevenue = true) =>
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
                CancellationComment:              o.CancellationComment
            )).ToList()
        );
}

// ── Request models ────────────────────────────────────────────────────────────
public sealed record SetPickupDateRequest(DateTime PickupDate);

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
