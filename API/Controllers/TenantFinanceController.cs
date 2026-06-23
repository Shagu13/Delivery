using Application.Tenants.Commands;
using Application.Tenants.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// The tenant co-admin (TenantAdmin) finance portal. Strictly scoped to the caller's own
/// tenant (JWT <c>tenantId</c> claim). Read-only for now: shows what the tenant owes the
/// company, what the company owes the tenant, and the two sub-customer balances.
/// </summary>
[Authorize(Roles = "TenantAdmin")]
public sealed class TenantFinanceController : BaseController
{
    private Guid TenantId =>
        CurrentTenantId ?? throw new UnauthorizedAccessException("Tenant ID not found in token.");

    // ── GET /api/tenantfinance/overview ───────────────────────────────────────
    [HttpGet("overview")]
    [ProducesResponseType(typeof(TenantFinanceOverviewDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Overview(CancellationToken ct)
        => Ok(await Sender.Send(new GetTenantFinanceOverviewQuery(TenantId), ct));

    // ── GET /api/tenantfinance/customers ──────────────────────────────────────
    [HttpGet("customers")]
    [ProducesResponseType(typeof(IReadOnlyList<TenantCustomerDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Customers(CancellationToken ct)
        => Ok(await Sender.Send(new GetTenantCustomersQuery(TenantId), ct));

    // ── GET /api/tenantfinance/customer-orders  (one sub-customer's order lines) ──
    [HttpGet("customer-orders")]
    [ProducesResponseType(typeof(IReadOnlyList<Application.CustomerSettlements.DTOs.OrderFinanceLineDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CustomerOrders(
        [FromQuery] Guid customerId, [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        CancellationToken ct)
        => Ok(await Sender.Send(new GetTenantCustomerOrderFinanceQuery(TenantId, customerId, date, monthly), ct));

    // ── POST /api/tenantfinance/payment  (record/clear a sub-customer payment) ──
    [HttpPost("payment")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RecordPayment(
        [FromBody] TenantOrderPaymentRequest request, CancellationToken ct)
    {
        var id = await Sender.Send(new SetTenantOrderPaymentCommand(
            TenantId, request.OrderId,
            request.CodPaidAmount, request.CodPaid,
            request.ServicePaidAmount, request.ServicePaid), ct);
        return Ok(new { orderId = id });
    }
}

public sealed record TenantOrderPaymentRequest(
    Guid     OrderId,
    decimal? CodPaidAmount,
    bool?    CodPaid,
    decimal? ServicePaidAmount,
    bool?    ServicePaid
);
