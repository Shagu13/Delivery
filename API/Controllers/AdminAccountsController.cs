using API.Models.AdminAccounts;
using Application.Admins.Commands.ResetAdminPassword;
using Application.Admins.DTOs;
using Application.Admins.Queries.GetAdminAccounts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

/// <summary>
/// Lets the dedicated "systemadmin" account reset the password of other Admin accounts.
/// Restricted by the SystemAdmin policy; ordinary Admins get 403.
/// </summary>
[Authorize(Policy = "SystemAdmin")]
public sealed class AdminAccountsController : BaseController
{
    // ── GET /api/adminaccounts ────────────────────────────────────────────────
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<AdminAccountDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        IReadOnlyList<AdminAccountDto> result = await Sender.Send(new GetAdminAccountsQuery(), ct);
        return Ok(result);
    }

    // ── PUT /api/adminaccounts/{id}/password ──────────────────────────────────
    /// <summary>
    /// Force-resets an Admin's password without the old one. The Admin's existing
    /// sessions stop working (401) as soon as the password changes.
    /// </summary>
    [HttpPut("{id}/password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> ResetPassword(
        string id, [FromBody] ResetAdminPasswordRequest request, CancellationToken ct)
    {
        await Sender.Send(
            new ResetAdminPasswordCommand(id, request.NewPassword, request.ConfirmNewPassword), ct);
        return NoContent();
    }
}
