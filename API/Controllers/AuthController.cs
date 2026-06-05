using API.Models.Auth;
using Application.Auth.Commands.Login;
using Application.Auth.Commands.RequestPasswordReset;
using Application.Auth.Commands.ResetPassword;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;

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

    // ── SignalR hub auth cookie ─────────────────────────────────────────────────
    // Browser WebSockets cannot send an Authorization header, so rather than place
    // the JWT in the hub URL (?access_token=...), the client stashes it in this
    // HttpOnly cookie scoped to /hubs. The browser then attaches it to the
    // WebSocket handshake, keeping the token out of the URL (and out of logs).

    private const string HubCookieName = "hubToken";

    [HttpPost("hub-cookie")]
    [Authorize]
    public IActionResult SetHubCookie([FromServices] IHostEnvironment env)
    {
        var auth = Request.Headers.Authorization.ToString();
        const string prefix = "Bearer ";
        var token = auth.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            ? auth[prefix.Length..]
            : auth;

        Response.Cookies.Append(HubCookieName, token, new CookieOptions
        {
            HttpOnly = true,
            // Plain HTTP in local dev (behind the Vite proxy); HTTPS in production.
            Secure   = !env.IsDevelopment(),
            SameSite = SameSiteMode.Strict,
            Path     = "/hubs",
            MaxAge   = TimeSpan.FromHours(8),
        });
        return Ok();
    }

    [HttpDelete("hub-cookie")]
    [AllowAnonymous]
    public IActionResult ClearHubCookie()
    {
        Response.Cookies.Delete(HubCookieName, new CookieOptions { Path = "/hubs" });
        return Ok();
    }
}
