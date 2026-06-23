namespace Domain;

/// <summary>
/// A white-label brand served on its own domain (e.g. livo.ge).
///
/// Customers who register on that domain are tagged with this Tenant's Id
/// (<see cref="Customer.TenantId"/>); a <c>null</c> TenantId means the customer
/// belongs to the root brand (dilo.ge).
///
/// Each Tenant is operated by a co-admin — a "TenantAdmin" <see cref="ApplicationUser"/>
/// referenced by <see cref="AdminApplicationUserId"/> — who sees only this tenant's
/// customers/orders. Fulfilment (couriers, warehouse, pricing, settlement) is still run
/// centrally by the root admin.
/// </summary>
public class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// The domain this brand is served on, e.g. "livo.ge". Matched against the request
    /// host at registration to stamp <see cref="Customer.TenantId"/>. Unique.
    /// </summary>
    public required string Host { get; set; }

    /// <summary>Brand name shown in the white-label UI.</summary>
    public required string DisplayName { get; set; }

    // ── Branding (white-label homepage) ──────────────────────────────────────
    /// <summary>URL of the brand logo shown on the tenant's homepage / app shell.</summary>
    public string? LogoUrl { get; set; }

    /// <summary>Primary brand color as a hex string, e.g. "#0F62FE".</summary>
    public string? PrimaryColor { get; set; }

    // ── Co-admin (TenantAdmin) ───────────────────────────────────────────────
    /// <summary>
    /// The ApplicationUser who administers this tenant (role "TenantAdmin").
    /// Null until a co-admin is assigned. Used at login to resolve the tenantId claim.
    /// </summary>
    public string?          AdminApplicationUserId { get; set; }
    public ApplicationUser? AdminApplicationUser   { get; set; }

    // ── Status ───────────────────────────────────────────────────────────────
    public bool     IsActive  { get; set; } = true;
    public DateTime CreatedAt { get; set; } = CustomTime.Now;

    // ── Navigation ───────────────────────────────────────────────────────────
    public ICollection<Customer> Customers { get; set; } = new List<Customer>();
}
