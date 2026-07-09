using Application.TenantSettlements.Commands;
using Application.TenantSettlements.DTOs;
using Application.TenantSettlements.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// The company (dilo) side of the tenant ↔ company monthly settlement. Restricted to the
/// dedicated "systemadmin" account: it records what the company pays a tenant (COD) and
/// collects from a tenant (service fees). The tenant co-admin sees these figures read-only
/// via /api/tenantfinance/overview.
/// </summary>
[Authorize(Policy = "SystemAdmin")]
public sealed class TenantSettlementsController : BaseController
{
    // ── GET /api/tenantsettlements?tenantId=&year=&month=  (ensure + recompute) ──
    [HttpGet]
    [ProducesResponseType(typeof(TenantSettlementDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(
        [FromQuery] Guid tenantId, [FromQuery] int year, [FromQuery] int month, CancellationToken ct)
        => Ok(await Sender.Send(new GetTenantSettlementQuery(tenantId, year, month), ct));

    // ── POST /api/tenantsettlements/payment  (record a livo↔dilo payment) ────────
    [HttpPost("payment")]
    [ProducesResponseType(typeof(TenantSettlementDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> RecordPayment(
        [FromBody] RecordTenantSettlementPaymentRequest request, CancellationToken ct)
        => Ok(await Sender.Send(new RecordTenantSettlementPaymentCommand(
            request.TenantId, request.Year, request.Month,
            request.CodPaidToTenant, request.ServicePaidByTenant), ct));

    // ── GET /api/tenantsettlements/orders  (per-order settlement sheet) ──────────
    [HttpGet("orders")]
    [ProducesResponseType(typeof(TenantSettlementOrdersResult), StatusCodes.Status200OK)]
    public async Task<IActionResult> Orders(
        [FromQuery] Guid tenantId, [FromQuery] DateOnly? date, [FromQuery] bool monthly,
        CancellationToken ct)
        => Ok(await Sender.Send(new GetTenantSettlementOrdersQuery(tenantId, date, monthly), ct));

    // ── POST /api/tenantsettlements/order-payment  (per-order COD / service) ─────
    [HttpPost("order-payment")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RecordOrderPayment(
        [FromBody] TenantOrderSettlementRequest request, CancellationToken ct)
    {
        var id = await Sender.Send(new RecordTenantOrderPaymentCommand(
            request.TenantId, request.OrderId,
            request.CodPaidAmount, request.CodPaid,
            request.ServicePaidAmount, request.ServicePaid), ct);
        return Ok(new { orderId = id });
    }
}

public sealed record TenantOrderSettlementRequest(
    Guid     TenantId,
    Guid     OrderId,
    decimal? CodPaidAmount,
    bool?    CodPaid,
    decimal? ServicePaidAmount,
    bool?    ServicePaid
);

public sealed record RecordTenantSettlementPaymentRequest(
    Guid     TenantId,
    int      Year,
    int      Month,
    decimal? CodPaidToTenant,
    decimal? ServicePaidByTenant
);
