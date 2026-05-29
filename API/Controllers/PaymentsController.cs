using Application.Common.Exceptions;
using Application.Payments.Commands;
using Application.Payments.DTOs;
using Application.Payments.Queries;
using Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace API.Controllers;

public sealed class PaymentsController : BaseController
{
    // ═════════════════════════════════════════════════════════════════════════
    // ADMIN ENDPOINTS
    // ═════════════════════════════════════════════════════════════════════════

    // ── GET /api/payments/admin ───────────────────────────────────────────────
    /// <summary>
    /// Returns all payment data for the admin Payments page:
    /// pending sender requests, unpaid sender groups, COD owed to senders,
    /// and courier settlements.
    /// </summary>
    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(AdminPaymentsPageDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAdminPayments(
        [FromQuery] DateTime? settlementFrom,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetAdminPaymentsQuery(settlementFrom), ct);
        return Ok(result);
    }

    // ── POST /api/payments/admin/confirm-sender ───────────────────────────────
    /// <summary>
    /// Admin confirms receipt of a payment from a sender (full or partial).
    /// </summary>
    [HttpPost("admin/confirm-sender")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ConfirmSenderPayment(
        [FromBody] ConfirmSenderPaymentRequest request,
        CancellationToken ct)
    {
        await Sender.Send(new ConfirmSenderPaymentCommand(
            request.PaymentRequestId,
            request.AmountReceived,
            request.Note), ct);
        return Ok();
    }

    // ── POST /api/payments/admin/pay-sender-cod ───────────────────────────────
    /// <summary>
    /// Admin marks that they have forwarded COD product money to a sender
    /// for the specified orders.
    /// </summary>
    [HttpPost("admin/pay-sender-cod")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(Guid), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> MarkCompanyPaidSender(
        [FromBody] MarkCompanyPaidSenderRequest request,
        CancellationToken ct)
    {
        var id = await Sender.Send(new MarkCompanyPaidSenderCommand(
            request.CustomerId,
            request.OrderIds,
            request.Note), ct);
        return CreatedAtAction(nameof(GetAdminPayments), new { }, new { paymentRequestId = id });
    }

    // ── POST /api/payments/admin/settlement-event ─────────────────────────────
    /// <summary>
    /// Marks a courier settlement event as paid/handed-over.
    /// EventType: "CompanyPaysCourier" or "CourierHandsOverRevenue".
    /// </summary>
    [HttpPost("admin/settlement-event")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(Guid), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> MarkSettlementEvent(
        [FromBody] MarkSettlementEventRequest request,
        CancellationToken ct)
    {
        if (!Enum.TryParse<PaymentRequestType>(request.EventType, out var eventType))
            return BadRequest(new { error = "Invalid EventType. Use 'CompanyPaysCourier' or 'CourierHandsOverRevenue'." });

        var id = await Sender.Send(new MarkCourierSettlementPaidCommand(
            request.DailySettlementId,
            eventType,
            request.Note), ct);
        return CreatedAtAction(nameof(GetAdminPayments), new { }, new { paymentRequestId = id });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // CUSTOMER ENDPOINTS
    // ═════════════════════════════════════════════════════════════════════════

    // ── GET /api/payments/my?year=2025&month=6 ────────────────────────────────
    /// <summary>
    /// Returns the authenticated customer's payments page data for the given month.
    /// Includes service fee orders, payment request history, and COD income.
    /// </summary>
    [HttpGet("my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(CustomerPaymentsPageDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyPayments(
        [FromQuery] int? year,
        [FromQuery] int? month,
        CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var now    = DateTime.UtcNow;

        var result = await Sender.Send(new GetCustomerPaymentsQuery(
            ApplicationUserId: userId,
            Year:  year  ?? now.Year,
            Month: month ?? now.Month), ct);

        return Ok(result);
    }

    // ── POST /api/payments/my/request ─────────────────────────────────────────
    /// <summary>
    /// Customer submits a payment request for selected orders.
    /// Orders must be WhoPaysForCompanyService == Sender and CompanyServicePaymentStatus == Unpaid.
    /// </summary>
    [HttpPost("my/request")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(Guid), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreatePaymentRequest(
        [FromBody] CreateSenderPaymentRequestApiRequest request,
        CancellationToken ct)
    {
        var userId   = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var customer = await ResolveCustomerIdAsync(userId, ct);

        var id = await Sender.Send(new CreateSenderPaymentRequestCommand(
            CustomerId: customer,
            OrderIds:   request.OrderIds,
            Note:       request.Note), ct);

        return CreatedAtAction(nameof(GetMyPayments), new { }, new { paymentRequestId = id });
    }

    // ── Helper: resolve CustomerId from ApplicationUserId ─────────────────────
    private async Task<Guid> ResolveCustomerIdAsync(string userId, CancellationToken ct)
    {
        // Reuse MediatR — fire a lightweight internal query
        // (We do a direct DB call here via a thin helper rather than adding a query class
        //  just for one GUID lookup — consistent with how other controllers handle this.)
        var context = HttpContext.RequestServices
            .GetRequiredService<Application.Common.Interfaces.IAppDbContext>();
        var customer = await context.Customers
            .Where(c => c.ApplicationUserId == userId)
            .Select(c => c.Id)
            .FirstOrDefaultAsync(ct);

        if (customer == Guid.Empty)
            throw new NotFoundException("Customer", userId);
        return customer;
    }
}

// ── Request models ─────────────────────────────────────────────────────────────

public sealed record ConfirmSenderPaymentRequest(
    Guid    PaymentRequestId,
    decimal AmountReceived,
    string? Note
);

public sealed record MarkCompanyPaidSenderRequest(
    Guid       CustomerId,
    List<Guid> OrderIds,
    string?    Note
);

public sealed record MarkSettlementEventRequest(
    Guid    DailySettlementId,
    string  EventType,
    string? Note
);

public sealed record CreateSenderPaymentRequestApiRequest(
    List<Guid> OrderIds,
    string?    Note
);
