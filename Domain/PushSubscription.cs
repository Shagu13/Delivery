namespace Domain;

/// <summary>
/// A Web Push subscription for one of a courier's devices (browser/PWA). Created when the
/// courier grants notification permission; used to deliver "new order" pushes even when the
/// app is closed. A courier may have several (one per device/browser). Keyed by Endpoint.
/// </summary>
public class PushSubscription
{
    public Guid Id { get; set; }

    /// <summary>The courier this subscription belongs to.</summary>
    public Guid CourierId { get; set; }
    public Courier? Courier { get; set; }

    /// <summary>Push service endpoint URL the message is POSTed to (unique per device).</summary>
    public string Endpoint { get; set; } = string.Empty;

    /// <summary>Client public key (P-256 ECDH), base64url — from the browser subscription.</summary>
    public string P256dh { get; set; } = string.Empty;

    /// <summary>Client auth secret, base64url — from the browser subscription.</summary>
    public string Auth { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
}
