using API.Excel;
using API.Models.Couriers;
using Application.Couriers.Commands.CreateCourier;
using Application.Couriers.Queries.Admin;
using Application.Couriers.Queries.CompletedByCourier;
using Application.Couriers.Commands.UpdateCourier;
using Application.Couriers.Commands.SetCourierActiveStatus;
using Application.Couriers.DTOs;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

// Authorization is per-method, not class-wide: every endpoint is Admin-only EXCEPT
// the GetAll roster read, which Operators also need (to populate the pickup-courier
// dropdown and the Delivery page's courier filter). A class-level [Authorize(Admin)]
// can't be loosened per-method (attributes combine with AND), so it lives per-action.
public sealed class CouriersController : BaseController
{
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
        => Ok(await Sender.Send(new GetCourierRosterQuery(), ct));

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
        // Company margin is internal — hidden from operators.
        var orders = await Sender.Send(new GetAdminCourierOrdersQuery(id, User.IsInRole("Operator")), ct);
        return orders is null ? NotFound() : Ok(orders);
    }

    // ── GET /api/couriers/assigned?date=YYYY-MM-DD  (Admin) ───────────────────
    /// <summary>
    /// Returns the orders assigned to a courier on the given Georgian calendar day, each
    /// tagged with its courierId. The admin UI groups the result by courier, and the
    /// page's per-courier Excel export (<see cref="ExportAssignedForCourier"/>) filters
    /// the same way so the two always agree.
    ///
    /// Filtered by <see cref="Order.AssignedToCourierAt"/> — when the admin last assigned
    /// the order to its current courier — rather than by delivery/completion time, so a
    /// reassignment moves the order onto its new assignment day instead of lingering under
    /// the old one.
    ///
    /// `date` is a Georgian wall-clock day key — timestamps are stored as Georgian
    /// wall-clock without an offset, so it compares directly against the column.
    /// </summary>
    [HttpGet("assigned")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAssignedForDay(
        [FromQuery] DateTime date,
        [FromQuery] bool includePrevious = true,
        CancellationToken ct = default)
        // Today's view also carries over still-open deliveries assigned on earlier days,
        // unless the admin switched that off (includePrevious=false → strictly today's).
        // Company margin is hidden from operators.
        => Ok(await Sender.Send(
            new GetAssignedOrdersForDayQuery(date, includePrevious, User.IsInRole("Operator")), ct));

    // ── GET /api/couriers/assigned/export  (Admin/Operator) ───────────────────
    /// <summary>
    /// Excel manifest of one courier's orders assigned on the given Georgian calendar
    /// day — same day filter as <see cref="GetAssignedForDay"/> (by
    /// <see cref="Order.AssignedToCourierAt"/>) and the same column layout as the Packages
    /// page's export (<c>GroupOrdersController.ExportExcel</c>): Date, Sender, City,
    /// District, Address, Recipient, Description, Phone, COD, Service Fee.
    /// </summary>
    [HttpGet("assigned/export")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ExportAssignedForCourier(
        [FromQuery] DateTime date,
        [FromQuery] Guid     courierId,
        [FromQuery] string   lang = "ka",
        [FromQuery] bool     includePrevious = true,
        CancellationToken ct = default)
    {
        DateTime day = date.Date;
        var isGeo = lang == "ka";

        AssignedOrdersExportDto export = await Sender.Send(
            new GetAssignedOrdersExportQuery(date, courierId, includePrevious, GeorgianNames: isGeo), ct);
        var courierName = export.CourierName;

        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add(isGeo ? "ამანათები" : "Packages");

        string[] headers = isGeo
            ? new[] { "თარიღი", "გამგზავნი", "ქალაქი", "სოფელი/უბანი", "მისამართი", "მიმღები", "აღწერა/კომენტარი", "საკონტაქტო", "ასაღები თანხა", "საკურიერო" }
            : new[] { "Date", "Sender", "City", "District", "Address", "Recipient", "Description/Comment", "Phone", "COD", "Service Fee" };

        for (int c = 0; c < headers.Length; c++)
            ws.Cell(1, c + 1).Value = headers[c];
        ws.Row(1).Style.Font.Bold = true;

        var row = 2;
        foreach (var r in export.Rows)
        {
            ws.Cell(row, 1).Value = r.CreatedAt;
            ws.Cell(row, 1).Style.DateFormat.Format = "dd.mm";
            ws.Cell(row, 2).Value = r.SenderName;
            ws.Cell(row, 3).Value = r.City;
            ws.Cell(row, 4).Value = r.District;
            ws.Cell(row, 5).Value = r.Address;
            ws.Cell(row, 6).Value = r.RecipientName;
            ws.Cell(row, 7).Value = r.Description;
            ws.Cell(row, 8).Value = r.Phone;
            // COD = OrderFinance.ExpectedCourierCash (package COD plus a recipient-paid fee);
            // left blank when nothing is collected.
            if (r.ExpectedCash > 0m) ws.Cell(row, 9).Value = r.ExpectedCash;
            ws.Cell(row, 10).Value = r.CompanyServicePrice;
            row++;
        }

        ws.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        // "dd.mm" rather than a literal "dd/mm" — '/' isn't a legal filename character.
        var namePart = SanitizeForFileName(courierName) is { Length: > 0 } n ? n : courierId.ToString();
        var fileName = $"{namePart}-{day:dd.MM}.xlsx";
        return File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName);
    }

    // Collapses a courier's display name into something safe to hand to the filesystem/
    // Content-Disposition header — strips characters Windows/macOS forbid in filenames and
    // trims the runs of spaces/dashes that leaves behind.
    private static string SanitizeForFileName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return string.Empty;
        var invalid = System.IO.Path.GetInvalidFileNameChars();
        var cleaned = new string(name.Where(ch => !invalid.Contains(ch)).ToArray()).Trim();
        return System.Text.RegularExpressions.Regex.Replace(cleaned, @"\s+", " ");
    }

    // ── GET /api/couriers/assigned-pickups?date=YYYY-MM-DD  (Admin) ───────────
    /// <summary>
    /// The pickup-leg mirror of <see cref="GetAssignedForDay"/>: group-order batches
    /// tagged with the courier who collects them, for one Georgian calendar day.
    ///
    /// A batch belongs to a day by its scheduled pickup date (<c>WhenPackagePickedUpDate</c>,
    /// else its created date). A day lists:
    ///   • the batches actually collected that day (dated by PickedUpAt), and
    ///   • the batches scheduled for that day that are still uncollected and not closed.
    /// So an old uncollected batch shows on its own day, not on today's list.
    /// </summary>
    [HttpGet("assigned-pickups")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAssignedPickupsForDay(
        [FromQuery] DateTime date, CancellationToken ct)
        => Ok(await Sender.Send(new GetAssignedPickupsForDayQuery(date), ct));

    // ── Completed tab: what couriers finished between two Georgian days (inclusive) ──
    // courierId omitted = every courier. Operators get the same rows minus company margin.

    // GET /api/couriers/completed/deliveries?courierId=&from=YYYY-MM-DD&to=YYYY-MM-DD
    [HttpGet("completed/deliveries")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IReadOnlyList<CompletedDeliveryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCompletedDeliveries(
        [FromQuery] Guid? courierId, [FromQuery] DateTime from, [FromQuery] DateTime to, CancellationToken ct)
        => Ok(await Sender.Send(new GetCompletedDeliveriesQuery(courierId, from, to, User.IsInRole("Operator")), ct));

    // GET /api/couriers/completed/pickups?courierId=&from=&to=
    [HttpGet("completed/pickups")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(typeof(IReadOnlyList<CompletedPickupDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCompletedPickups(
        [FromQuery] Guid? courierId, [FromQuery] DateTime from, [FromQuery] DateTime to, CancellationToken ct)
        => Ok(await Sender.Send(new GetCompletedPickupsQuery(courierId, from, to), ct));

    private const string XlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    // GET /api/couriers/completed/deliveries/export?courierId=&from=&to=&lang=ka
    [HttpGet("completed/deliveries/export")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ExportCompletedDeliveries(
        [FromQuery] Guid? courierId, [FromQuery] DateTime from, [FromQuery] DateTime to,
        [FromQuery] string lang = "ka", CancellationToken ct = default)
    {
        IReadOnlyList<CompletedDeliveryDto> items =
            await Sender.Send(new GetCompletedDeliveriesQuery(courierId, from, to, User.IsInRole("Operator")), ct);
        return File(CompletedCourierExcelBuilder.BuildDeliveries(items, lang), XlsxContentType,
            $"completed-deliveries-{from:dd.MM}-{to:dd.MM}.xlsx");
    }

    // GET /api/couriers/completed/pickups/export?courierId=&from=&to=&lang=ka
    [HttpGet("completed/pickups/export")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ExportCompletedPickups(
        [FromQuery] Guid? courierId, [FromQuery] DateTime from, [FromQuery] DateTime to,
        [FromQuery] string lang = "ka", CancellationToken ct = default)
    {
        IReadOnlyList<CompletedPickupDto> items = await Sender.Send(new GetCompletedPickupsQuery(courierId, from, to), ct);
        return File(CompletedCourierExcelBuilder.BuildPickups(items, lang), XlsxContentType,
            $"completed-pickups-{from:dd.MM}-{to:dd.MM}.xlsx");
    }

}