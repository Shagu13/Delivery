using API.Models.Auth;
using Application.Auth.Commands.Login;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public sealed class AuthController : BaseController
{
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
            CustomerId: result.CustomerId   // ← new
        ));
    }
}
