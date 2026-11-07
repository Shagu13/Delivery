using System.Security.Claims;
using Application.Common.Security;
using Domain;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;

namespace API.Auth;

/// <summary>
/// Ends Operator sessions that must no longer work. JWTs are stateless, so without this a
/// deleted operator stays signed in until the token expires (8h).
///
/// For Operator-role tokens only: the token must carry the current session version
/// (<see cref="AuthClaimTypes.CurrentSessionVersion"/>) and the user must still exist.
/// The existence check is one primary-key lookup per request. Unlike the Admin check it does
/// not compare the security stamp, so an Admin renaming or editing an operator keeps them in.
/// </summary>
public static class OperatorSessionValidator
{
    public static async Task ValidateAsync(TokenValidatedContext context)
    {
        ClaimsPrincipal? principal = context.Principal;
        if (principal is null || !principal.IsInRole("Operator"))
            return;

        string? userId  = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        string? version = principal.FindFirstValue(AuthClaimTypes.SessionVersion);

        if (string.IsNullOrEmpty(userId)
            || !string.Equals(version, AuthClaimTypes.CurrentSessionVersion, StringComparison.Ordinal))
        {
            context.Fail("Session is no longer valid. Please sign in again.");
            return;
        }

        UserManager<ApplicationUser> userManager =
            context.HttpContext.RequestServices.GetRequiredService<UserManager<ApplicationUser>>();

        if (await userManager.FindByIdAsync(userId) is null)
            context.Fail("Session is no longer valid. Please sign in again.");
    }
}
