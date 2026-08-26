using Application.CompanyBankAccounts.Commands;
using Application.CompanyBankAccounts.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// The company's own bank accounts (Admin-managed), surfaced on a customer's Finance
/// invoice export so they know where to pay the company service fee.
/// </summary>
[Authorize(Roles = "Admin")]
public sealed class CompanyBankAccountsController : BaseController
{
    // ── GET /api/companybankaccounts ────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var result = await Sender.Send(new GetCompanyBankAccountsQuery(), ct);
        return Ok(result);
    }

    // ── POST /api/companybankaccounts ───────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Add([FromBody] CompanyBankAccountRequest request, CancellationToken ct)
    {
        await Sender.Send(new AddCompanyBankAccountCommand(
            request.Label, request.BankName, request.AccountHolderName, request.AccountNumber), ct);
        var result = await Sender.Send(new GetCompanyBankAccountsQuery(), ct);
        return Ok(result);
    }

    // ── PUT /api/companybankaccounts/{accountId} ────────────────────────────
    [HttpPut("{accountId:guid}")]
    public async Task<IActionResult> Update(
        Guid accountId, [FromBody] CompanyBankAccountRequest request, CancellationToken ct)
    {
        await Sender.Send(new UpdateCompanyBankAccountCommand(
            accountId, request.Label, request.BankName, request.AccountHolderName, request.AccountNumber), ct);
        var result = await Sender.Send(new GetCompanyBankAccountsQuery(), ct);
        return Ok(result);
    }

    // ── PUT /api/companybankaccounts/{accountId}/default ────────────────────
    [HttpPut("{accountId:guid}/default")]
    public async Task<IActionResult> SetDefault(Guid accountId, CancellationToken ct)
    {
        await Sender.Send(new SetDefaultCompanyBankAccountCommand(accountId), ct);
        var result = await Sender.Send(new GetCompanyBankAccountsQuery(), ct);
        return Ok(result);
    }

    // ── DELETE /api/companybankaccounts/{accountId} ─────────────────────────
    [HttpDelete("{accountId:guid}")]
    public async Task<IActionResult> Delete(Guid accountId, CancellationToken ct)
    {
        await Sender.Send(new DeleteCompanyBankAccountCommand(accountId), ct);
        var result = await Sender.Send(new GetCompanyBankAccountsQuery(), ct);
        return Ok(result);
    }
}

public sealed record CompanyBankAccountRequest(string? Label, string BankName, string AccountHolderName, string AccountNumber);
