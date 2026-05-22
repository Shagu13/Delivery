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
using System.Text.RegularExpressions;

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
                PickUpCity: request.PickUpCity,
                PickUpDistrict: request.PickUpDistrict,
                PickUpAddress: request.PickUpAddress,
                Note: request.Note,
                Orders: request.Orders
                    .Select(o => new CreateOrderDto(
                        o.RecipientFirstName,
                        o.RecipientLastName,
                        o.RecipientPhone,
                        o.RecipientCity,
                        o.RecipientDistrict,
                        o.RecipientAddress,
                        o.Description,
                        o.IsFragile,
                        o.ProductPaymentStatus,
                        o.WhoPaysForCompanyService,
                        o.AmountToCollectForPackage,
                        o.CompanyServicePrice,
                        o.WeightPriceTierId))       
                    .ToList(),
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
                    o.RecipientFirstName,
                    o.RecipientLastName))
                .ToList()
        );

        return CreatedAtAction(nameof(GetById), new { id = response.GroupOrderId }, response);
    }

    // ── GET /api/grouporders ─────────────────────────────────────────────────
    [HttpGet]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminGroupOrderResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll([FromQuery] string? search, CancellationToken ct)
    {
        var result = await Sender.Send(new GetAllGroupOrdersQuery(search), ct);
        return Ok(result.Select(MapToAdminResponse).ToList());
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
        return Ok(result.Select(MapToAdminResponse).ToList());
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STATUS-TRANSITION ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════

    [HttpPut("{id:guid}/accept")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Accept(Guid id, CancellationToken ct)
    {
        await Sender.Send(new AcceptGroupOrderCommand(id), ct);
        return NoContent();
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
    [Authorize(Roles = "Admin")]
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
    public async Task<IActionResult> DownloadTemplate(CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<IAppDbContext>();

        // ── Load cities + districts from DB ───────────────────────────────────
        var cities = await db.Cities
            .AsNoTracking()
            .Where(c => c.DateDeleted == null)
            .OrderBy(c => c.CityName)
            .Select(c => new
            {
                c.CityName,
                Districts = c.Districts
                    .Where(d => d.DateDeleted == null)
                    .OrderBy(d => d.DistrictName)
                    .Select(d => d.DistrictName)
                    .ToList()
            })
            .ToListAsync(ct);

        using var workbook = new XLWorkbook();

        // ── Hidden Data sheet ─────────────────────────────────────────────────
        var wsData = workbook.Worksheets.Add("Data");
        wsData.Visibility = XLWorksheetVisibility.Hidden;

        // Column A: city list header + values
        wsData.Cell(1, 1).Value = "Cities";
        for (int i = 0; i < cities.Count; i++)
            wsData.Cell(i + 2, 1).Value = cities[i].CityName;

        // Wrap city column in an Excel Table — required for search-as-you-type in Excel 365/2021
        var cityTableRange = wsData.Range(1, 1, cities.Count + 1, 1);
        cityTableRange.AsTable("T_CityList");

        // Named range pointing at the data rows (used by data validation source)
        workbook.DefinedNames.Add("CityList", wsData.Range(2, 1, cities.Count + 1, 1));

        // One column per city with its districts — each also wrapped in a Table
        for (int col = 0; col < cities.Count; col++)
        {
            var city = cities[col];
            var districts = city.Districts.Count > 0 ? city.Districts : [city.CityName];
            int excelCol = col + 2; // B onwards

            wsData.Cell(1, excelCol).Value = city.CityName;
            for (int row = 0; row < districts.Count; row++)
                wsData.Cell(row + 2, excelCol).Value = districts[row];

            var rangeName = SanitizeRangeName(city.CityName);

            // Table enables search-as-you-type for district dropdowns in Excel 365/2021
            var distTableRange = wsData.Range(1, excelCol, districts.Count + 1, excelCol);
            distTableRange.AsTable("T_" + rangeName);

            // Named range for INDIRECT-based dependent dropdown (works in all Excel versions)
            workbook.DefinedNames.Add(rangeName, wsData.Range(2, excelCol, districts.Count + 1, excelCol));
        }

        // ── Orders sheet ──────────────────────────────────────────────────────
        var ws = workbook.Worksheets.Add("Orders");

        // ── Headers ───────────────────────────────────────────────────────────
        string[] headers =
        [
            "RecipientFirstName", "RecipientLastName", "RecipientPhone",
            "RecipientCity", "RecipientDistrict", "RecipientAddress",
            "Description", "PaymentStatus", "WhoPaysForCourierFee", "IsFragile"
        ];
        bool[] required = [true, true, true, true, true, true, false, true, true, true];

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

        // ── Sample row ────────────────────────────────────────────────────────
        ws.Cell(2, 1).Value = "Ana";
        ws.Cell(2, 2).Value = "Smith";
        ws.Cell(2, 3).Value = "+995599123456";
        ws.Cell(2, 4).Value = "Tbilisi";
        ws.Cell(2, 5).Value = "Saburtalo";
        ws.Cell(2, 6).Value = "Pekini Ave 42";
        ws.Cell(2, 7).Value = "Fragile – handle with care";
        ws.Cell(2, 8).Value = "Not Paid";
        ws.Cell(2, 9).Value = "Sender";
        ws.Cell(2, 10).Value = "No";

        foreach (var cell in ws.Row(2).CellsUsed())
        {
            cell.Style.Font.Italic = true;
            cell.Style.Font.FontColor = XLColor.FromArgb(0xA8, 0xA1, 0x9A);
        }

        // ── City dropdown (D2:D500) ───────────────────────────────────────────
        var cityVal = ws.Range("D2:D500").CreateDataValidation();
        cityVal.List("CityList", true);
        cityVal.ShowErrorMessage = false;
        cityVal.ErrorTitle = "Invalid City";
        cityVal.ErrorMessage = "Please select a city from the list.";

        // ── District dependent dropdown (E2:E500) ─────────────────────────────
        // INDIRECT(SUBSTITUTE(D2," ","_")) resolves to the named range for the chosen city
        for (int row = 2; row <= 500; row++)
        {
            var distVal = ws.Cell(row, 5).CreateDataValidation();
            distVal.List($"INDIRECT(SUBSTITUTE(D{row},\" \",\"_\"))", true);
            distVal.ShowErrorMessage = true;
            distVal.ErrorTitle = "Invalid District";
            distVal.ErrorMessage = "Please select a city first, then choose a district.";
        }

        // ── Static dropdowns (H, I, J) ────────────────────────────────────────
        var paymentVal = ws.Range("H2:H500").CreateDataValidation();
        paymentVal.List("\"Paid,Not Paid\"", true);
        paymentVal.ShowErrorMessage = true;
        paymentVal.ErrorTitle = "Invalid value";
        paymentVal.ErrorMessage = "Choose Paid or Not Paid";

        var payerVal = ws.Range("I2:I500").CreateDataValidation();
        payerVal.List("\"Sender,Recipient\"", true);
        payerVal.ShowErrorMessage = true;
        payerVal.ErrorTitle = "Invalid value";
        payerVal.ErrorMessage = "Choose Sender or Recipient";

        var fragileVal = ws.Range("J2:J500").CreateDataValidation();
        fragileVal.List("\"Yes,No\"", true);
        fragileVal.ShowErrorMessage = true;
        fragileVal.ErrorTitle = "Invalid value";
        fragileVal.ErrorMessage = "Choose Yes or No";

        ws.Columns().AdjustToContents();
        ws.SheetView.FreezeRows(1);

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);

        return File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "group-order-template.xlsx");
    }

    /// <summary>
    /// Converts a city name into a valid Excel named range identifier.
    /// Replaces any non-alphanumeric character with '_' and prepends '_' if it starts with a digit.
    /// </summary>
    private static string SanitizeRangeName(string name)
    {
        var s = Regex.Replace(name, @"[^A-Za-z0-9_]", "_");
        if (char.IsDigit(s[0])) s = "_" + s;
        return s;
    }

    [HttpPost("parse-excel")]
    [AllowAnonymous]
    public IActionResult ParseExcel(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { title = "No file uploaded." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".xlsx")
            return BadRequest(new { title = "Only .xlsx files are supported." });

        using var stream = file.OpenReadStream();
        using var workbook = new XLWorkbook(stream);
        var ws = workbook.Worksheets.FirstOrDefault(s => s.Name == "Orders")
         ?? workbook.Worksheets.First();

        var orders = new List<OrderItemRequest>();
        int lastRow = ws.LastRowUsed()?.RowNumber() ?? 1;

        for (int row = 2; row <= lastRow; row++)
        {
            var firstName = ws.Cell(row, 1).GetString().Trim();
            if (string.IsNullOrWhiteSpace(firstName)) continue;
            if (firstName.Equals("Ana", StringComparison.OrdinalIgnoreCase)
                && ws.Cell(row, 2).GetString().Trim().Equals("Smith", StringComparison.OrdinalIgnoreCase))
                continue;

            var description = ws.Cell(row, 7).GetString().Trim();
            var paymentRaw = ws.Cell(row, 8).GetString().Trim();
            var payerRaw = ws.Cell(row, 9).GetString().Trim();
            var fragileRaw = ws.Cell(row, 10).GetString().Trim();

            var paymentStatus = paymentRaw.Equals("Paid", StringComparison.OrdinalIgnoreCase)
                ? PaymentStatus.Paid
                : PaymentStatus.NotPaid;

            var payer = payerRaw.Equals("Recipient", StringComparison.OrdinalIgnoreCase)
                ? ServicePayer.Recipient
                : ServicePayer.Sender;

            var isFragile = fragileRaw.Equals("Yes", StringComparison.OrdinalIgnoreCase);

            var recipientCity     = ws.Cell(row, 4).GetString().Trim();
            var recipientDistrict = ws.Cell(row, 5).GetString().Trim();

            // Excel imports always use district names directly — no in-city mode needed.
            orders.Add(new OrderItemRequest(
                RecipientFirstName:           firstName,
                RecipientLastName:            ws.Cell(row, 2).GetString().Trim(),
                RecipientPhone:               ws.Cell(row, 3).GetString().Trim(),
                RecipientCity:                recipientCity,
                RecipientDistrict:            recipientDistrict,
                RecipientAddress:             ws.Cell(row, 6).GetString().Trim(),
                Description:                  description.Length > 0 ? description : null,
                IsFragile:                    isFragile,
                ProductPaymentStatus:         paymentStatus,
                WhoPaysForCompanyService:     payer
            ));
        }

        if (orders.Count == 0)
            return BadRequest(new { title = "No valid rows found." });

        return Ok(orders);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  Private mapper
    // ══════════════════════════════════════════════════════════════════════════
    private static AdminGroupOrderResponse MapToAdminResponse(AdminGroupOrderDto go) =>
        new(
            Id:                      go.Id,
            CreatedAt:               go.CreatedAt,
            Status:                  go.Status.ToString(),
            SenderFirstName:         go.SenderFirstName,
            SenderLastName:          go.SenderLastName,
            SenderIdNumber:          go.SenderIdNumber,
            SenderBusinessName:      go.SenderBusinessName,
            SenderPhone:             go.SenderPhone,
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
            Orders: go.Orders.Select(o => new AdminOrderResponse(
                Id:                               o.Id,
                TrackingNumber:                   o.TrackingNumber,
                RecipientFirstName:               o.RecipientFirstName,
                RecipientLastName:                o.RecipientLastName,
                RecipientPhone:                   o.RecipientPhone,
                RecipientCity:                    o.RecipientCity,
                RecipientCityGeo:                 o.RecipientCityGeo,
                RecipientDistrict:                o.RecipientDistrict,
                RecipientDistrictGeo:             o.RecipientDistrictGeo,
                RecipientAddress:                 o.RecipientAddress,
                Description:                      o.Description,
                IsFragile:                        o.IsFragile,
                Status:                           o.Status.ToString(),
                ProductPaymentStatus:             o.ProductPaymentStatus.ToString(),
                WhoPaysForCompanyService:         o.WhoPaysForCompanyService.ToString(),
                CourierSalary:                    o.CourierSalary,
                CompanyServicePrice:              o.CompanyServicePrice,
                CourierId:                        o.CourierId,
                CreatedAt:                        o.CreatedAt,
                DeliveryDateFrom:                 o.DeliveryDateFrom,
                DeliveryDateTo:                   o.DeliveryDateTo
            )).ToList()
        );
}

// ── Request models ────────────────────────────────────────────────────────────
public sealed record SetPickupDateRequest(DateTime PickupDate);

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

