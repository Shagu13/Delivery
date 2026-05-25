using API.Models.Auth;
using Application.Auth.Commands.Login;
using Application.Auth.Commands.RequestPasswordReset;
using Application.Auth.Commands.ResetPassword;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class AuthController : BaseController
{
    // ── Login ─────────────────────────────────────────────────────────────────

    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Login(
        [FromBody] LoginRequest request, CancellationToken ct)
    {
        var result = await Sender.Send(
            new LoginCommand(request.Username, request.Password), ct);

        return Ok(new LoginResponse(
            Token:      result.Token,
            Username:   result.Username,
            FirstName:  result.FirstName,
            LastName:   result.LastName,
            Role:       result.Role,
            ExpiresAt:  result.ExpiresAt,
            CustomerId: result.CustomerId
        ));
    }

    // ── Forgot password ───────────────────────────────────────────────────────

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest request, CancellationToken ct)
    {
        var baseUrl = $"{Request.Scheme}://{Request.Host}/reset-password";
        await Sender.Send(new RequestPasswordResetCommand(request.PhoneNumber, baseUrl), ct);
        return Ok();
    }

    // ── Reset password ────────────────────────────────────────────────────────

    [HttpPost("reset-password")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        await Sender.Send(new ResetPasswordCommand(
            Code:               request.Code,
            NewPassword:        request.NewPassword,
            ConfirmNewPassword: request.ConfirmNewPassword), ct);

        return Ok();
    }
}
