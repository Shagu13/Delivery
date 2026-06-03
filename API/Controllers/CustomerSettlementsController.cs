using Application.CustomerSettlements.Commands;
using Application.CustomerSettlements.DTOs;
using Application.CustomerSettlements.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class CustomerSettlementsController : BaseController
{
    // ── GET /api/customersettlements/preview  (Admin) ─────────────────────────
    [HttpGet("preview")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(CustomerSettlementPreviewDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPreview(
        [FromQuery] Guid customerId,
        [FromQuery] int  year,
        [FromQuery] int  month,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerSettlementPreviewQuery(customerId, year, month), ct);
        return Ok(result);
    }

    // ── GET /api/customersettlements  (Admin) — list for a customer ───────────
    [HttpGet]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(typeof(IReadOnlyList<CustomerSettlementDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetForCustomer(
        [FromQuery] Guid customerId,
        [FromQuery] int? year,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetCustomerSettlementsQuery(customerId, year), ct);
        return Ok(result);
    }

    // ── GET /api/customersettlements/my  (Customer) — read-only ───────────────
    [HttpGet("my")]
    [Authorize(Roles = "Customer")]
    [ProducesResponseType(typeof(IReadOnlyList<CustomerSettlementDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMy(
        [FromQuery] int? year,
        CancellationToken ct)
    {
        var result = await Sender.Send(new GetMyCustomerSettlementsQuery(CurrentUserId, year), ct);
        return Ok(result);
    }

    // ── POST /api/customersettlements  (Admin) — create ───────────────────────
    [HttpPost]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(
        [FromBody] CustomerSettlementPeriodRequest request,
        CancellationToken ct)
    {
        var id = await Sender.Send(
            new CreateCustomerSettlementCommand(request.CustomerId, request.Year, request.Month), ct);

        return CreatedAtAction(
            nameof(GetPreview),
            new { customerId = request.CustomerId, year = request.Year, month = request.Month },
            new { settlementId = id });
    }

    // ── PUT /api/customersettlements  (Admin) — recompute figures ─────────────
    [HttpPut]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Recompute(
        [FromBody] CustomerSettlementPeriodRequest request,
        CancellationToken ct)
    {
        var id = await Sender.Send(
            new UpdateCustomerSettlementCommand(request.CustomerId, request.Year, request.Month), ct);

        return Ok(new { settlementId = id });
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
                request.CustomerId, request.Year, request.Month,
                request.CodPaidByCompany, request.ServicePaidToCompany), ct);

        return Ok(new { settlementId = id });
    }
}

// ── Local request models ────────────────────────────────────────────────────────
public sealed record CustomerSettlementPeriodRequest(
    Guid CustomerId,
    int  Year,
    int  Month
);

public sealed record RecordPaymentRequest(
    Guid     CustomerId,
    int      Year,
    int      Month,
    decimal? CodPaidByCompany,
    decimal? ServicePaidToCompany
);
