using MediatR;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace API.Controllers;

/// <summary>
/// Base for all API controllers.
/// Provides lazy access to MediatR Sender and current-user claim helpers.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public abstract class BaseController : ControllerBase
{
    private ISender? _sender;

    /// <summary>Lazily resolved from DI — avoids constructor injection boilerplate in every controller.</summary>
    protected ISender Sender =>
        _sender ??= HttpContext.RequestServices.GetRequiredService<ISender>();

    /// <summary>The ApplicationUser.Id (string GUID) from the JWT sub claim.</summary>
    protected string CurrentUserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new InvalidOperationException("User ID not found in token.");

    /// <summary>
    /// The domain Courier.Id embedded in the JWT by JwtTokenGenerator.
    /// Only valid for Courier-role endpoints.
    /// </summary>
    protected Guid CurrentCourierId
    {
        get
        {
            var raw = User.FindFirstValue("courierId");
            if (raw is null || !Guid.TryParse(raw, out var id))
                throw new InvalidOperationException("Courier ID not found in token.");
            return id;
        }
    }

    /// <summary>
    /// The white-label Tenant.Id embedded in the JWT, identifying which tenant this
    /// principal is scoped to. Present for a TenantAdmin co-admin and for tenant-owned
    /// customers; null for root admins and root (dilo) customers. Tenant-scoped queries
    /// must filter by this — never trust a tenant id from the request body/query.
    /// </summary>
    protected Guid? CurrentTenantId =>
        Guid.TryParse(User.FindFirstValue("tenantId"), out var id) ? id : null;
}
