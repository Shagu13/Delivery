using Application.CustomerSettlements.Commands;
using Application.CustomerSettlements.DTOs;
using Application.CustomerSettlements.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class CustomerSettlementsController : BaseController
{
    // ── GET /api/customersettlements  (Admin) — a customer's batch invoices ───
    [HttpGet]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<CustomerSettlementDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetForCustomer(
        [FromQuery] Guid      customerId,
        [FromQuery] DateOnly? date,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerSettlementsQuery(customerId, date), ct);
        return Ok(result);
    }

    // ── GET /api/customersettlements/my  (Customer) — read-only ───────────────
    [HttpGet("my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(IReadOnlyList<CustomerSettlementDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMy(
        [FromQuery] DateOnly? date,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetMyCustomerSettlementsQuery(CurrentUserId, date), ct);
        return Ok(result);
    }

    // ── POST /api/customersettlements/payment  (Admin) — record payment ───────
    [HttpPost("payment")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RecordPayment(
        [FromBody] RecordPaymentRequest request,
        CancellationToken ct)
    {
        var id = await Sender.Send(
            new RecordCustomerSettlementPaymentCommand(
                request.SettlementId, request.CodPaidByCompany, request.ServicePaidToCompany), ct);

        return Ok(new { settlementId = id });
    }
}

// ── Local request models ────────────────────────────────────────────────────────
public sealed record RecordPaymentRequest(
    Guid     SettlementId,
    decimal? CodPaidByCompany,
    decimal? ServicePaidToCompany
);
