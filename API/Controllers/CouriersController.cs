using API.Models.Couriers;
using Application.Couriers.Commands.CreateCourier;
using Application.Couriers.Commands.UpdateCourier;
using Application.Couriers.Commands.SetCourierActiveStatus;
using Application.Couriers.DTOs;
using Application.Common.Interfaces;
using Application.Finance;
using ClosedXML.Excel;
using Domain;
using Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

// Authorization is per-method, not class-wide: every endpoint is Admin-only EXCEPT
// the GetAll roster read, which Operators also need (to populate the pickup-courier
// dropdown and the Delivery page's courier filter). A class-level [Authorize(Admin)]
// can't be loosened per-method (attributes combine with AND), so it lives per-action.
public sealed class CouriersController : BaseController
{
    // A batch the pickup courier will never collect — excluded from "still out on".
    private static readonly OrderStatus[] ClosedGroupOrderStatuses =
    [
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
        OrderStatus.AllDelivered,
    ];

    private readonly IAppDbContext _context;

    public CouriersController(IAppDbContext context)
    {
        _context = context;
    }

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
    {
        var couriers = await _context.Couriers
            .AsNoTracking()
            .OrderBy(c => c.AssignedCity)
            .ThenBy(c => c.FirstName)
            .Select(c => new
            {
                courierId = c.Id,
                firstName = c.FirstName,
                lastName = c.LastName,
                fullName = $"{c.FirstName} {c.LastName}",
                username = c.ApplicationUser.UserName,
                assignedCity = c.AssignedCity,
                assignedDistrict = c.AssignedDistrict,
                phoneNumber = c.PhoneNumber,
                idNumber = c.IdNumber,
                isDeleted = c.DateDeleted != null,
                dateDeleted = c.DateDeleted,
                defaultSalary = c.DefaultSalary,
            })
            .ToListAsync(ct);

        return Ok(couriers);
    }

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
        var exists = await _context.Couriers.AnyAsync(c => c.Id == id, ct);
        if (!exists) return NotFound();

        bool hideRevenue = User.IsInRole("Operator");
        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == id)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new
            {
                id                      = o.Id,
                trackingNumber          = o.TrackingNumber,
                recipientName           = o.RecipientName,
                recipientPhone          = o.RecipientPhone,
                recipientCity           = o.RecipientCity,
                recipientDistrict       = o.RecipientDistrict,
                recipientAddress        = o.RecipientAddress,
                status                  = o.Status.ToString(),
                companyServicePrice     = o.CompanyServicePrice,
                courierSalary           = o.CourierSalary,
                // Company margin is internal — hidden from operators.
                companyRevenue          = hideRevenue ? (decimal?)null : o.CompanyRevenue,
                orderType               = o.OrderType.ToString(),
                deliveredAt             = o.DeliveredAt,
                deliveredToWarehouseAt  = o.DeliveredToWarehouseAt,
                createdAt               = o.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(orders);
    }

    /// <summary>Open last-mile statuses: shown on today's assigned list even when assigned on an earlier day.</summary>
    private static readonly OrderStatus[] CarryOverStatuses =
    {
        OrderStatus.CourierAssignedToDeliver,
        OrderStatus.CourierDeliveringTheOrderToRecipient,
        OrderStatus.DeliveryPostponed,
    };

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
        [FromQuery] DateTime date, CancellationToken ct)
    {
        DateTime day    = date.Date;
        DateTime dayEnd = day.AddDays(1);

        bool hideRevenue = User.IsInRole("Operator");
        // Today's view also carries over still-open deliveries assigned on earlier days.
        bool carryOver = day == CustomTime.Today;
        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId != null
                     && ((o.AssignedToCourierAt >= day && o.AssignedToCourierAt < dayEnd)
                         || (carryOver && o.AssignedToCourierAt < day
                             && CarryOverStatuses.Contains(o.Status))))
            .OrderByDescending(o => o.AssignedToCourierAt)
            .Select(o => new
            {
                courierId               = o.CourierId,
                id                      = o.Id,
                trackingNumber          = o.TrackingNumber,
                // The owning store (sender) business name, via either ownership path.
                senderBusinessName      = o.GroupOrder != null && o.GroupOrder.Customer != null
                                            ? o.GroupOrder.Customer.BusinessName
                                            : (o.Customer != null ? o.Customer.BusinessName : ""),
                recipientName           = o.RecipientName,
                recipientPhone          = o.RecipientPhone,
                recipientCity           = o.RecipientCity,
                recipientDistrict       = o.RecipientDistrict,
                recipientAddress        = o.RecipientAddress,
                status                  = o.Status.ToString(),
                companyServicePrice     = o.CompanyServicePrice,
                amountToCollectForPackage = o.AmountToCollectForPackage,
                courierSalary           = o.CourierSalary,
                // Company margin is internal — hidden from operators.
                companyRevenue          = hideRevenue ? (decimal?)null : o.CompanyRevenue,
                orderType               = o.OrderType.ToString(),
                assignedToCourierAt     = o.AssignedToCourierAt,
                deliveredAt             = o.DeliveredAt,
                deliveredToWarehouseAt  = o.DeliveredToWarehouseAt,
                createdAt               = o.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(orders);
    }

    // ── GET /api/couriers/assigned/export  (Admin/Operator) ───────────────────
    /// <summary>
    /// Excel manifest of one courier's orders assigned on the given Georgian calendar
    /// day — same day filter as <see cref="GetAssignedForDay"/> (by
    /// <see cref="Order.AssignedToCourierAt"/>) and the same column layout as the Packages
    /// page's export (<c>GroupOrdersController.ExportExcel</c>): Date, Sender, City,
    /// Address, Recipient, Description, Phone, COD, Service Fee.
    /// </summary>
    [HttpGet("assigned/export")]
    [Authorize(Roles = "Admin,Operator")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ExportAssignedForCourier(
        [FromQuery] DateTime date,
        [FromQuery] Guid     courierId,
        [FromQuery] string   lang = "ka",
        CancellationToken ct = default)
    {
        DateTime day    = date.Date;
        DateTime dayEnd = day.AddDays(1);
        bool carryOver  = day == CustomTime.Today;

        var courierName = await _context.Couriers
            .AsNoTracking()
            .Where(c => c.Id == courierId)
            .Select(c => c.FirstName + " " + c.LastName)
            .FirstOrDefaultAsync(ct);

        var orders = await _context.Orders
            .AsNoTracking()
            .Include(o => o.GroupOrder)!.ThenInclude(g => g!.Customer)
            .Include(o => o.Customer)
            .Where(o => o.CourierId == courierId
                     && ((o.AssignedToCourierAt >= day && o.AssignedToCourierAt < dayEnd)
                         || (carryOver && o.AssignedToCourierAt < day
                             && CarryOverStatuses.Contains(o.Status))))
            .OrderBy(o => o.CreatedAt)
            .ToListAsync(ct);

        var isGeo = lang == "ka";

        // Small, rarely-changing table — a plain lookup here rather than the cached
        // Application-layer geo dictionary (internal to that assembly).
        var cityGeo = isGeo
            ? (await _context.Cities.AsNoTracking().Where(c => c.DateDeleted == null).ToListAsync(ct))
                .GroupBy(c => c.CityName).ToDictionary(g => g.Key, g => g.First().CityNameGeo)
            : new Dictionary<string, string?>();

        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add(isGeo ? "ამანათები" : "Packages");

        string[] headers = isGeo
            ? new[] { "თარიღი", "გამგზავნი", "ქალაქი", "მისამართი", "მიმღები", "აღწერა/კომენტარი", "საკონტაქტო", "ასაღები თანხა", "საკურიერო" }
            : new[] { "Date", "Sender", "City", "Address", "Recipient", "Description/Comment", "Phone", "COD", "Service Fee" };

        for (int c = 0; c < headers.Length; c++)
            ws.Cell(1, c + 1).Value = headers[c];
        ws.Row(1).Style.Font.Bold = true;

        var row = 2;
        foreach (var o in orders)
        {
            var customer = o.GroupOrder?.Customer ?? o.Customer;
            var senderName = customer == null
                ? string.Empty
                : string.IsNullOrWhiteSpace(customer.BusinessName)
                    ? $"{customer.FirstName} {customer.LastName}".Trim()
                    : customer.BusinessName;

            ws.Cell(row, 1).Value = o.CreatedAt;
            ws.Cell(row, 1).Style.DateFormat.Format = "dd.mm";
            ws.Cell(row, 2).Value = senderName;
            ws.Cell(row, 3).Value = isGeo ? (cityGeo.GetValueOrDefault(o.RecipientCity) ?? o.RecipientCity) : o.RecipientCity;
            ws.Cell(row, 4).Value = o.RecipientAddress;
            ws.Cell(row, 5).Value = o.RecipientName;
            ws.Cell(row, 6).Value = o.Description ?? string.Empty;
            ws.Cell(row, 7).Value = o.RecipientPhone;
            // Same COD convention as the Packages export: package COD plus, when the
            // recipient pays the company service fee at delivery, that fee too.
            var expectedCash = OrderFinance.ExpectedCourierCash(o);
            if (expectedCash > 0m) ws.Cell(row, 8).Value = expectedCash;
            ws.Cell(row, 9).Value = o.CompanyServicePrice;
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
    {
        DateTime day    = date.Date;
        DateTime dayEnd = day.AddDays(1);

        IQueryable<GroupOrder> query = _context.GroupOrders
            .AsNoTracking()
            .Where(g => g.CourierId != null)
            .Where(g => (g.PickedUpAt >= day && g.PickedUpAt < dayEnd)
                     || (g.PickedUpAt == null && !ClosedGroupOrderStatuses.Contains(g.Status)
                         && (g.WhenPackagePickedUpDate ?? g.CreatedAt) >= day
                         && (g.WhenPackagePickedUpDate ?? g.CreatedAt) < dayEnd));

        var pickups = await query
            .OrderByDescending(g => g.PickedUpAt)
            .Select(g => new
            {
                courierId          = g.CourierId,
                id                 = g.Id,
                senderBusinessName = g.SenderBusinessName,
                senderPhone        = g.SenderPhone,
                pickUpCity         = g.PickUpCity,
                pickUpDistrict     = g.PickUpDistrict,
                pickUpAddress      = g.PickUpAddress,
                numberOfPackages   = g.NumberOfPackages,
                status             = g.Status.ToString(),
                pickedUpAt         = g.PickedUpAt,
                createdAt          = g.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(pickups);
    }

}