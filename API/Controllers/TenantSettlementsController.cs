using Application.TenantSettlements.Commands;
using Application.TenantSettlements.DTOs;
using Application.TenantSettlements.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// The company (dilo) side of the tenant ↔ company monthly settlement. Admin-only: the
/// company records what it pays a tenant (COD) and collects from a tenant (service fees).
/// The tenant co-admin sees these figures read-only via /api/tenantfinance/overview.
/// </summary>
[Authorize(Roles = "Admin")]
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
}

public sealed record RecordTenantSettlementPaymentRequest(
    Guid     TenantId,
    int      Year,
    int      Month,
    decimal? CodPaidToTenant,
    decimal? ServicePaidByTenant
);
