using Application.CustomerSettlements.Commands;
using Application.CustomerSettlements.DTOs;
using Application.CustomerSettlements.Queries;
using Application.Settlements.Commands;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// Per-order finance lines for the reworked settlement pages, plus the admin
/// per-order payment action. Customers see their own orders by placement date;
/// admins and couriers see them by delivery date.
/// </summary>
public sealed class OrderFinanceController : BaseController
{
    // ── GET /api/orderfinance/my  (Customer) — own orders, by placement date ──
    [HttpGet("my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(IReadOnlyList<OrderFinanceLineDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMy(
        [FromQuery] DateOnly? date,
        [FromQuery] bool paymentsMode,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetMyOrderFinanceLinesQuery(CurrentUserId, date, paymentsMode), ct);
        return Ok(result);
    }

    // ── GET /api/orderfinance/customer  (Admin) — a customer's orders, by delivery date ──
    [HttpGet("customer")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<OrderFinanceLineDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetForCustomer(
        [FromQuery] Guid customerId, [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerOrderFinanceLinesQuery(customerId, date, monthly), ct);
        return Ok(result);
    }

    // ── GET /api/orderfinance/courier  (Courier) — own delivered orders, by delivery date ──
    [HttpGet("courier")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(typeof(IReadOnlyList<OrderFinanceLineDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetForCourier([FromQuery] DateOnly? date, CancellationToken ct)
    {
        var result = await Sender.Send(new GetCourierOrderFinanceLinesQuery(CurrentCourierId, date), ct);
        return Ok(result);
    }

    // ── GET /api/orderfinance/courier-lines  (Admin) — a courier's delivered orders ──
    [HttpGet("courier-lines")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<OrderFinanceLineDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetForCourierAdmin(
        [FromQuery] Guid courierId, [FromQuery] DateOnly? date, CancellationToken ct)
    {
        var result = await Sender.Send(new GetCourierOrderFinanceLinesQuery(courierId, date), ct);
        return Ok(result);
    }

    // ── POST /api/orderfinance/courier-payment  (Admin) — record/clear a per-order courier payment ──
    [HttpPost("courier-payment")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RecordCourierPayment(
        [FromBody] CourierPaymentRequest request, CancellationToken ct)
    {
        var id = await Sender.Send(new SetOrderCourierSettlementPaymentCommand(
            request.OrderId,
            request.SalaryPaidAmount, request.SalaryPaid,
            request.CodTransferredAmount, request.CodTransferred), ct);

        return Ok(new { orderId = id });
    }

    // ── POST /api/orderfinance/courier-pay  (Admin) — pay salary or record COD transfer in bulk ──
    [HttpPost("courier-pay")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CourierPay(
        [FromBody] CourierPayRequest request, CancellationToken ct)
    {
        var allocations = request.Allocations
            .Select(a => new CourierOrderPaymentAllocation(a.OrderId, a.Amount))
            .ToList();

        var paid = await Sender.Send(
            new PayCourierOrdersCommand(request.CourierId, request.Flow, allocations), ct);
        return Ok(new { paid });
    }

    // ── POST /api/orderfinance/payment  (Admin) — record/clear a per-order payment ──
    [HttpPost("payment")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RecordPayment(
        [FromBody] OrderPaymentRequest request, CancellationToken ct)
    {
        var id = await Sender.Send(new SetOrderSettlementPaymentCommand(
            request.OrderId,
            request.CodPaidAmount, request.CodPaid,
            request.ServicePaidAmount, request.ServicePaid,
            RequireRootCustomer: true), ct);

        return Ok(new { orderId = id });
    }

    // ── POST /api/orderfinance/pay  (Admin) — pay COD or service across a customer's orders ──
    [HttpPost("pay")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Pay(
        [FromBody] PayRequest request, CancellationToken ct)
    {
        var allocations = request.Allocations
            .Select(a => new OrderPaymentAllocation(a.OrderId, a.Amount))
            .ToList();

        var paid = await Sender.Send(
            new PayCustomerOrdersCommand(request.CustomerId, request.Service, allocations), ct);
        return Ok(new { paid });
    }
}

public sealed record PayRequest(Guid CustomerId, bool Service, List<PayAllocationRequest> Allocations);
public sealed record PayAllocationRequest(Guid OrderId, decimal Amount);

// ── Courier-side request models ─────────────────────────────────────────────────────
public sealed record CourierPaymentRequest(
    Guid     OrderId,
    decimal? SalaryPaidAmount,
    bool?    SalaryPaid,
    decimal? CodTransferredAmount,
    bool?    CodTransferred
);

public sealed record CourierPayRequest(
    Guid                          CourierId,
    CourierPaymentFlow            Flow,
    List<PayAllocationRequest>    Allocations
);

// ── Local request model ───────────────────────────────────────────────────────────
public sealed record OrderPaymentRequest(
    Guid     OrderId,
    decimal? CodPaidAmount,
    bool?    CodPaid,
    decimal? ServicePaidAmount,
    bool?    ServicePaid
);
