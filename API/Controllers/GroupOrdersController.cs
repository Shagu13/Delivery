using API.Models.GroupOrders;
using Application.GroupOrders.Commands.CreateGroupOrder;
using Application.GroupOrders.DTOs;
using Application.GroupOrders.Queries.GetAllGroupOrders;
using Application.GroupOrders.Queries.GetCustomerGroupOrders;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class GroupOrdersController : BaseController
{
    // ── POST /api/grouporders ────────────────────────────────────────────────
    /// <summary>
    /// Public — no login required. Sender submits pickup form from the website.
    /// </summary>
    [HttpPost]
    [AllowAnonymous]
    [ProducesResponseType(typeof(CreateGroupOrderResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Create(
        [FromBody] CreateGroupOrderRequest request,
        CancellationToken ct)
    {
        var command = new CreateGroupOrderCommand(
            new CreateGroupOrderDto(
                SenderFirstName:    request.SenderFirstName,
                SenderLastName:     request.SenderLastName,
                SenderIdNumber:     request.SenderIdNumber,
                SenderBusinessName: request.SenderBusinessName,
                SenderPhone:        request.SenderPhone,
                PickUpCity:         request.PickUpCity,
                PickUpDistrict:     request.PickUpDistrict,
                PickUpAddress:      request.PickUpAddress,
                Note:               request.Note,
                Orders: request.Orders
                    .Select(o => new CreateOrderDto(
                        o.RecipientFirstName,
                        o.RecipientLastName,
                        o.RecipientPhone,
                        o.RecipientCity,
                        o.RecipientDistrict,
                        o.RecipientAddress,
                        o.Description))
                    .ToList(),
                CustomerId: request.CustomerId   // ← pass through from frontend
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

        return CreatedAtAction(
            actionName: nameof(GetById),
            routeValues: new { id = response.GroupOrderId },
            value: response);
    }

    // ── GET /api/grouporders?search=… ────────────────────────────────────────
    /// <summary>
    /// Admin-only. Returns all group orders (newest first), each with their
    /// child orders. Supports optional full-text search across sender name,
    /// sender phone, recipient name, recipient phone, and tracking number.
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminGroupOrderResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetAllGroupOrdersQuery(search), ct);

        var response = result.Select(go => new AdminGroupOrderResponse(
            Id: go.Id,
            CreatedAt: go.CreatedAt,
            Status: go.Status.ToString(),
            SenderFirstName: go.SenderFirstName,
            SenderLastName: go.SenderLastName,
            SenderIdNumber: go.SenderIdNumber,
            SenderBusinessName: go.SenderBusinessName,
            SenderPhone: go.SenderPhone,
            PickUpCity: go.PickUpCity,
            PickUpDistrict: go.PickUpDistrict,
            PickUpAddress: go.PickUpAddress,
            Note: go.Note,
            NumberOfPackages: go.NumberOfPackages,
            Orders: go.Orders.Select(o => new AdminOrderResponse(
                Id: o.Id,
                TrackingNumber: o.TrackingNumber,
                RecipientFirstName: o.RecipientFirstName,
                RecipientLastName: o.RecipientLastName,
                RecipientPhone: o.RecipientPhone,
                RecipientCity: o.RecipientCity,
                RecipientDistrict: o.RecipientDistrict,
                RecipientAddress: o.RecipientAddress,
                Description: o.Description,
                Status: o.Status.ToString(),
                IsPaid: o.IsPaid,
                CreatedAt: o.CreatedAt
            )).ToList()
        )).ToList();

        return Ok(response);
    }

    // ── GET /api/grouporders/{id} ────────────────────────────────────────────
    /// <summary>Get a single group order by ID with all its child orders.</summary>
    [HttpGet("{id:guid}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(AdminGroupOrderResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var result = await Sender.Send(new GetAllGroupOrdersQuery(null), ct);
        var go = result.FirstOrDefault(x => x.Id == id);

        if (go is null)
            return NotFound();

        var response = new AdminGroupOrderResponse(
            Id: go.Id,
            CreatedAt: go.CreatedAt,
            Status: go.Status.ToString(),
            SenderFirstName: go.SenderFirstName,
            SenderLastName: go.SenderLastName,
            SenderIdNumber: go.SenderIdNumber,
            SenderBusinessName: go.SenderBusinessName,
            SenderPhone: go.SenderPhone,
            PickUpCity: go.PickUpCity,
            PickUpDistrict: go.PickUpDistrict,
            PickUpAddress: go.PickUpAddress,
            Note: go.Note,
            NumberOfPackages: go.NumberOfPackages,
            Orders: go.Orders.Select(o => new AdminOrderResponse(
                Id: o.Id,
                TrackingNumber: o.TrackingNumber,
                RecipientFirstName: o.RecipientFirstName,
                RecipientLastName: o.RecipientLastName,
                RecipientPhone: o.RecipientPhone,
                RecipientCity: o.RecipientCity,
                RecipientDistrict: o.RecipientDistrict,
                RecipientAddress: o.RecipientAddress,
                Description: o.Description,
                Status: o.Status.ToString(),
                IsPaid: o.IsPaid,
                CreatedAt: o.CreatedAt
            )).ToList()
        );

        return Ok(response);
    }

    // ── GET /api/grouporders/excel-template ──────────────────────────────────
    [HttpGet("excel-template")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult DownloadTemplate()
    {
        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("Orders");

        string[] headers =
        [
            "RecipientFirstName", "RecipientLastName", "RecipientPhone",
            "RecipientCity", "RecipientDistrict", "RecipientAddress", "Description"
        ];
        bool[] required = [true, true, true, true, true, true, false];

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

        ws.Cell(2, 1).Value = "Ana";
        ws.Cell(2, 2).Value = "Smith";
        ws.Cell(2, 3).Value = "+995599123456";
        ws.Cell(2, 4).Value = "Tbilisi";
        ws.Cell(2, 5).Value = "Saburtalo";
        ws.Cell(2, 6).Value = "Pekini Ave 42";
        ws.Cell(2, 7).Value = "Fragile – handle with care";

        foreach (var cell in ws.Row(2).CellsUsed())
        {
            cell.Style.Font.Italic = true;
            cell.Style.Font.FontColor = XLColor.FromArgb(0xA8, 0xA1, 0x9A);
        }

        ws.Columns().AdjustToContents();
        ws.SheetView.FreezeRows(1);

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);

        return File(
            ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "group-order-template.xlsx");
    }

    // ── POST /api/grouporders/parse-excel ────────────────────────────────────
    [HttpPost("parse-excel")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<OrderItemRequest>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public IActionResult ParseExcel(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { title = "No file uploaded." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".xlsx")
            return BadRequest(new { title = "Only .xlsx files are supported." });

        using var stream = file.OpenReadStream();
        using var workbook = new XLWorkbook(stream);
        var ws = workbook.Worksheets.First();

        var orders = new List<OrderItemRequest>();
        int lastRow = ws.LastRowUsed()?.RowNumber() ?? 1;

        for (int row = 2; row <= lastRow; row++)
        {
            var firstName = ws.Cell(row, 1).GetString().Trim();
            if (string.IsNullOrWhiteSpace(firstName)) continue;
            if (firstName.Equals("Ana", StringComparison.OrdinalIgnoreCase)
                && ws.Cell(row, 2).GetString().Trim()
                        .Equals("Smith", StringComparison.OrdinalIgnoreCase))
                continue;

            var description = ws.Cell(row, 7).GetString().Trim();
            orders.Add(new OrderItemRequest(
                RecipientFirstName: firstName,
                RecipientLastName: ws.Cell(row, 2).GetString().Trim(),
                RecipientPhone: ws.Cell(row, 3).GetString().Trim(),
                RecipientCity: ws.Cell(row, 4).GetString().Trim(),
                RecipientDistrict: ws.Cell(row, 5).GetString().Trim(),
                RecipientAddress: ws.Cell(row, 6).GetString().Trim(),
                Description: description.Length > 0 ? description : null
            ));
        }

        if (orders.Count == 0)
            return BadRequest(new { title = "No valid rows found." });

        return Ok(orders);
    }

    /// <summary>Returns all group orders belonging to the authenticated customer.</summary>
    [HttpGet("my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(IReadOnlyList<AdminGroupOrderResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var claim = User.FindFirst("customerId")?.Value;
        if (!Guid.TryParse(claim, out var customerId))
            return Unauthorized();

        var result = await Sender.Send(new GetCustomerGroupOrdersQuery(customerId), ct);

        var response = result.Select(go => new AdminGroupOrderResponse(
            Id: go.Id,
            CreatedAt: go.CreatedAt,
            Status: go.Status.ToString(),
            SenderFirstName: go.SenderFirstName,
            SenderLastName: go.SenderLastName,
            SenderIdNumber: go.SenderIdNumber,
            SenderBusinessName: go.SenderBusinessName,
            SenderPhone: go.SenderPhone,
            PickUpCity: go.PickUpCity,
            PickUpDistrict: go.PickUpDistrict,
            PickUpAddress: go.PickUpAddress,
            Note: go.Note,
            NumberOfPackages: go.NumberOfPackages,
            Orders: go.Orders.Select(o => new AdminOrderResponse(
                Id: o.Id,
                TrackingNumber: o.TrackingNumber,
                RecipientFirstName: o.RecipientFirstName,
                RecipientLastName: o.RecipientLastName,
                RecipientPhone: o.RecipientPhone,
                RecipientCity: o.RecipientCity,
                RecipientDistrict: o.RecipientDistrict,
                RecipientAddress: o.RecipientAddress,
                Description: o.Description,
                Status: o.Status.ToString(),
                IsPaid: o.IsPaid,
                CreatedAt: o.CreatedAt
            )).ToList()
        )).ToList();

        return Ok(response);
    }
}
