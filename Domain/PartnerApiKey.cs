using Microsoft.EntityFrameworkCore;

namespace Domain;

/// <summary>
/// An API credential issued to a business partner (e.g. livo.ge) so their own
/// backend can push orders into this system machine-to-machine.
///
/// A partner maps onto a <see cref="Customer"/> record: every order placed with
/// this key is owned by that customer and settled through the normal monthly
/// CustomerSettlement flow. The raw key is shown to the admin once at creation
/// and never stored — only its SHA-256 hash (<see cref="KeyHash"/>) is persisted.
/// </summary>
[Index(nameof(KeyHash), IsUnique = true)]
public class PartnerApiKey
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The partner this key belongs to — the billing/ownership account for its orders.</summary>
    public Guid      CustomerId { get; set; }
    public Customer? Customer   { get; set; }

    /// <summary>Human-readable label for the key, e.g. "livo.ge production".</summary>
    public required string Name { get; set; }

    /// <summary>SHA-256 hash (hex) of the raw key. The raw key itself is never stored.</summary>
    public required string KeyHash { get; set; }

    /// <summary>
    /// First few characters of the raw key (e.g. "pk_AbC12345"), kept in clear so the
    /// admin can recognise a key in listings without exposing the secret.
    /// </summary>
    public required string KeyPrefix { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime  CreatedAt  { get; set; } = DateTime.UtcNow;
    public DateTime? RevokedAt  { get; set; }
    public DateTime? LastUsedAt { get; set; }
}
