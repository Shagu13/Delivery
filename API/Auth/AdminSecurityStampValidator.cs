using System.Security.Claims;
using Application.Common.Security;
using Domain;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;

namespace API.Auth;

/// <summary>
/// Forces a sign-out of an Admin whose password was reset by the system admin.
///
/// JWTs are stateless, so on its own a token stays valid until it expires. For
/// Admin-role tokens only, this compares the <c>sstamp</c> claim (the user's Identity
/// SecurityStamp when the token was issued) with the current database value. A password
/// reset rotates the stamp, so every token issued before it fails with 401 and the
/// client signs the user out. Other roles are not checked (no extra DB lookup, and
/// Identity's other stamp-rotating operations never affect them).
/// </summary>
public static class AdminSecurityStampValidator
{
    public static async Task ValidateAsync(TokenValidatedContext context)
    {
        ClaimsPrincipal? principal = context.Principal;
        if (principal is null || !principal.IsInRole("Admin"))
            return;

        string? userId     = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        Claim?  stampClaim = principal.FindFirst(AuthClaimTypes.SecurityStamp);

        // An Admin token without the claim predates this check: reject it once.
        if (string.IsNullOrEmpty(userId) || stampClaim is null)
        {
            context.Fail("Session is no longer valid. Please sign in again.");
            return;
        }

        UserManager<ApplicationUser> userManager =
            context.HttpContext.RequestServices.GetRequiredService<UserManager<ApplicationUser>>();

        // The token generator writes "" for a user with no stamp, so compare null as "".
        ApplicationUser? user = await userManager.FindByIdAsync(userId);
        if (user is null
            || !string.Equals(user.SecurityStamp ?? "", stampClaim.Value, StringComparison.Ordinal))
            context.Fail("Session is no longer valid. Please sign in again.");
    }
}
