namespace Application.Common.Interfaces;

/// <summary>
/// Web Push (VAPID) sender for courier "new order" notifications that show even when the app
/// is closed. Implemented in Infrastructure over the standard Web Push protocol (no paid
/// service). No-ops safely when VAPID keys are not configured.
/// </summary>
public interface IWebPushService
{
    /// <summary>The configured VAPID public key (base64url), or null when push isn't set up.
    /// Sent to the client so it can create a subscription.</summary>
    string? PublicKey { get; }

    /// <summary>Generate a fresh VAPID keypair for one-time setup (admin convenience).</summary>
    (string PublicKey, string PrivateKey) GenerateKeys();

    /// <summary>
    /// Send a "new order" push to every device the courier has subscribed. Best-effort:
    /// swallows failures and prunes subscriptions the push service reports as gone.
    /// </summary>
    Task NotifyNewOrderAsync(Guid courierId, string title, string body, string url, CancellationToken ct = default);
}
