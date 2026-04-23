using API.Models.Auth;
using Application.Auth.Commands.Login;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Application.Auth.DTOs;

namespace API.Controllers;

public sealed class AuthController : BaseController
{
    /// <summary>
    /// Login with username and password. Returns a JWT token.
    /// Default admin credentials: username=admin, password=Admin@12345
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Login(
        [FromBody] LoginRequest request,
        CancellationToken ct)
    {
        var command = new LoginCommand(
            Username: request.Username,
            Password: request.Password
        );

        var result = await Sender.Send(command, ct);

        return Ok(new LoginResponse(
            Token: result.Token,
            Username: result.Username,
            FirstName: result.FirstName,
            LastName: result.LastName,
            Role: result.Role,
            ExpiresAt: result.ExpiresAt
        ));
    }
}