using API.Excel;
using Application.CompanyBankAccounts.Queries;
using Application.CustomerSettlements.Commands;
using Application.CustomerSettlements.DTOs;
using Application.CustomerSettlements.Queries;
using Application.Settlements.Commands;
using Application.Settlements.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// Per-order finance lines for the reworked settlement pages, plus the admin
/// per-order payment action. Customers, admins, and couriers all see their default
/// view dated the same way — by delivery, falling back to placement while an order
/// is still undelivered — so the same date/range selects the same orders everywhere.
/// The customer page additionally offers a "payments" view (dated by COD payout)
/// with no admin equivalent.
/// </summary>
public sealed class OrderFinanceController : BaseController
{
    // ── GET /api/orderfinance/my  (Customer) — own orders, by delivery date (falls
    //    back to placement while undelivered) — matches the admin/courier reads ──
    [HttpGet("my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(IReadOnlyList<OrderFinanceLineDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMy(
        [FromQuery] DateOnly? date,
        [FromQuery] bool paymentsMode,
        [FromQuery] bool monthly,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var result = await Sender.Send(
            new GetMyOrderFinanceLinesQuery(CurrentUserId, date, paymentsMode, monthly, from, to), ct);
        return Ok(result);
    }

    // ── GET /api/orderfinance/my/export  (Customer) — own orders as Excel ─────
    [HttpGet("my/export")]
    [Authorize(Roles = "Customer")]
    [Produces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]
    public async Task<IActionResult> ExportMy(
        [FromQuery] DateOnly? date,
        [FromQuery] bool paymentsMode,
        [FromQuery] bool monthly,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] string lang = "en",
        CancellationToken ct = default)
    {
        var result = await Sender.Send(
            new GetMyOrderFinanceLinesQuery(CurrentUserId, date, paymentsMode, monthly, from, to), ct);

        byte[] bytes = FinanceExcelBuilder.Build(result, "DILO FINANCE", lang);
        string filename = $"Dilo-Finance-{Domain.CustomTime.Now:yyyy-MM-dd}.xlsx";
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
    }

    // ── GET /api/orderfinance/my/invoice-export  (Customer) — sender-pays orders only,
    //    with the company's default bank account and a service-fee total, as Excel ──
    [HttpGet("my/invoice-export")]
    [Authorize(Roles = "Customer")]
    [Produces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]
    public async Task<IActionResult> ExportMyInvoice(
        [FromQuery] DateOnly? date,
        [FromQuery] bool paymentsMode,
        [FromQuery] bool monthly,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] string lang = "en",
        CancellationToken ct = default)
    {
        var result = await Sender.Send(
            new GetMyOrderFinanceLinesQuery(CurrentUserId, date, paymentsMode, monthly, from, to), ct);
        // Sender-pays orders (and billable failures) invoice the whole fee. A recipient-pays order that
        // carries a customer surcharge invoices only that surcharge, as "Sender", so the Service
        // column adds up to what the customer actually owes.
        var invoiceLines = result
            .Where(l => l.SenderOwesService || l.CustomerSurcharge > 0m)
            .Select(l => l.SenderOwesService
                ? l
                : l with { CompanyServicePrice = l.CustomerSurcharge, WhoPaysForCompanyService = "Sender" })
            .ToList();

        var bankAccounts = await Sender.Send(new GetCompanyBankAccountsQuery(), ct);
        var bank = bankAccounts.FirstOrDefault(a => a.IsDefault) ?? bankAccounts.FirstOrDefault();
        string? bankLine = bank is null
            ? null
            : lang == "ka"
                ? $"საბანკო ანგარიში: {bank.BankName} · {bank.AccountHolderName} · {bank.AccountNumber}"
                : $"Bank Account: {bank.BankName} · {bank.AccountHolderName} · {bank.AccountNumber}";

        byte[] bytes = FinanceExcelBuilder.Build(invoiceLines, lang == "ka" ? "დილო ინვოისი" : "DILO INVOICE", lang, bankLine);
        string filename = $"Dilo-Invoice-{Domain.CustomTime.Now:yyyy-MM-dd}.xlsx";
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
    }

    // ── GET /api/orderfinance/customer  (Admin) — a customer's orders, by delivery date ──
    [HttpGet("customer")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<OrderFinanceLineDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetForCustomer(
        [FromQuery] Guid customerId, [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerOrderFinanceLinesQuery(customerId, date, monthly, from, to), ct);
        return Ok(result);
    }

    // ── GET /api/orderfinance/customer/export  (Admin) — a customer's orders as Excel ──
    [HttpGet("customer/export")]
    [Authorize(Roles = "Admin")]
    [Produces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ExportForCustomer(
        [FromQuery] Guid customerId, [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerOrderFinanceLinesQuery(customerId, date, monthly, from, to), ct);

        byte[] bytes = FinanceExcelBuilder.Build(result, "DILO FINANCE");
        string filename = $"Dilo-Finance-{Domain.CustomTime.Now:yyyy-MM-dd}.xlsx";
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
    }

    // ── GET /api/orderfinance/all-customers  (Admin) — every customer's orders, by delivery date ──
    // Powers the date-first Finance grid: one row per customer for the chosen date/range,
    // expandable to that customer's orders. The frontend groups the flat result by customerId.
    [HttpGet("all-customers")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<OrderFinanceLineDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAllCustomers(
        [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetAllCustomersOrderFinanceLinesQuery(date, monthly, from, to), ct);
        return Ok(result);
    }

    // ── GET /api/orderfinance/customer-grid  (Admin) — the Payments grid: lines + customer contacts ──
    // mode = Effective (all-customers behavior) | Delivered | ToSettle (ignores the date window).
    [HttpGet("customer-grid")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(CustomerFinanceGridDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCustomerGrid(
        [FromQuery] CustomerGridMode mode, [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerFinanceGridQuery(mode, date, monthly, from, to), ct);
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

    // ── GET /api/orderfinance/courier/date-basis  (Courier) — which date their list above is keyed by ──
    [HttpGet("courier/date-basis")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(typeof(Application.Couriers.CourierDateBasis), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyDateBasis(CancellationToken ct) =>
        Ok(await Sender.Send(new Application.Couriers.GetMyCourierDateBasisQuery(CurrentCourierId), ct));

    // ── GET /api/orderfinance/courier-lines  (Admin) — a courier's orders for a day ──
    // `basis` = Delivered | Assigned; omitted → the courier's default (regional couriers by assignment day).
    [HttpGet("courier-lines")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<OrderFinanceLineDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetForCourierAdmin(
        [FromQuery] Guid courierId, [FromQuery] DateOnly? date, [FromQuery] Application.Couriers.CourierDateBasis? basis,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCourierOrderFinanceLinesQuery(courierId, date, IncludePostponed: true, Basis: basis), ct);
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

    // ── GET /api/orderfinance/payment-receipts  (Admin) — a customer's payment history ──
    [HttpGet("payment-receipts")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<PaymentReceiptDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPaymentReceiptsForCustomer(
        [FromQuery] Guid customerId, [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerPaymentReceiptsQuery(customerId, date, monthly, from, to), ct);
        return Ok(result);
    }

    // ── GET /api/orderfinance/payment-receipts/my  (Customer) — own payment history ──
    [HttpGet("payment-receipts/my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(IReadOnlyList<PaymentReceiptDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyPaymentReceipts(
        [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetMyPaymentReceiptsQuery(CurrentUserId, date, monthly, from, to), ct);
        return Ok(result);
    }

    // ── GET /api/orderfinance/payment-receipts/couriers  (Admin) — courier payment history ──
    // courierId omitted = every courier's receipts.
    [HttpGet("payment-receipts/couriers")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<PaymentReceiptDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPaymentReceiptsForCouriers(
        [FromQuery] Guid? courierId, [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCourierPaymentReceiptsQuery(courierId, date, monthly, from, to), ct);
        return Ok(result);
    }

    // ── GET /api/orderfinance/payment-receipts/courier/my  (Courier) — own payment history ──
    [HttpGet("payment-receipts/courier/my")]
    [Authorize(Roles = "Courier")]
    [ProducesResponseType(typeof(IReadOnlyList<PaymentReceiptDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyCourierPaymentReceipts(
        [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCourierPaymentReceiptsQuery(CurrentCourierId, date, monthly, from, to), ct);
        return Ok(result);
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
