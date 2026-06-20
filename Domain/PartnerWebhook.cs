using Microsoft.EntityFrameworkCore;

namespace Domain;

/// <summary>
/// A partner's registered webhook endpoint. When an order owned by the partner
/// (<see cref="Customer"/>) changes status, a signed POST is delivered to
/// <see cref="Url"/>. The <see cref="Secret"/> is shared with the partner and used
/// to HMAC-sign each payload so they can verify it came from us; it is stored in
/// clear precisely because we must re-sign with it on every delivery.
/// </summary>
[Index(nameof(CustomerId))]
public class PartnerWebhook
{
    public Guid      Id         { get; set; } = Guid.NewGuid();
    public Guid      CustomerId { get; set; }
    public Customer? Customer   { get; set; }

    /// <summary>Absolute https/http URL the partner exposes to receive events.</summary>
    public required string Url { get; set; }

    /// <summary>Shared signing secret (HMAC-SHA256). Sent to the partner once at creation.</summary>
    public required string Secret { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime  CreatedAt     { get; set; } = CustomTime.Now;
    public DateTime? DeactivatedAt { get; set; }
}
