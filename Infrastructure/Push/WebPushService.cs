using System.Net;
using System.Text.Json;
using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WebPush;

namespace Infrastructure.Push;

/// <summary>VAPID config, bound from the "WebPush" appsettings/environment section.</summary>
public sealed class WebPushOptions
{
    public string? PublicKey { get; set; }
    public string? PrivateKey { get; set; }
    /// <summary>VAPID subject: a "mailto:you@domain" or "https://your.site" URL.</summary>
    public string? Subject { get; set; }
}

public sealed class WebPushService : IWebPushService
{
    private readonly IAppDbContext _db;
    private readonly WebPushOptions _opts;
    private readonly ILogger<WebPushService> _log;
    private readonly WebPushClient _client = new();

    public WebPushService(IAppDbContext db, IOptions<WebPushOptions> opts, ILogger<WebPushService> log)
    {
        _db = db;
        _opts = opts.Value;
        _log = log;
    }

    public string? PublicKey => string.IsNullOrWhiteSpace(_opts.PublicKey) ? null : _opts.PublicKey;

    public (string PublicKey, string PrivateKey) GenerateKeys()
    {
        var keys = VapidHelper.GenerateVapidKeys();
        return (keys.PublicKey, keys.PrivateKey);
    }

    public async Task NotifyNewOrderAsync(Guid courierId, string title, string body, string url, CancellationToken ct = default)
    {
        // Not configured → no-op (the app runs fine without push set up).
        if (string.IsNullOrWhiteSpace(_opts.PublicKey) || string.IsNullOrWhiteSpace(_opts.PrivateKey))
            return;

        var subs = await _db.PushSubscriptions
            .Where(s => s.CourierId == courierId)
            .ToListAsync(ct);
        if (subs.Count == 0) return;

        var payload = JsonSerializer.Serialize(new { title, body, url, tag = "dilo-new-order" });
        var vapid = new VapidDetails(
            string.IsNullOrWhiteSpace(_opts.Subject) ? "mailto:admin@dilo.ge" : _opts.Subject,
            _opts.PublicKey, _opts.PrivateKey);

        var dead = new List<Domain.PushSubscription>();
        foreach (var s in subs)
        {
            try
            {
                await _client.SendNotificationAsync(new WebPush.PushSubscription(s.Endpoint, s.P256dh, s.Auth), payload, vapid);
            }
            catch (WebPushException ex) when (ex.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
            {
                dead.Add(s); // expired / unsubscribed — prune it
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Web push to courier {CourierId} failed for one endpoint.", courierId);
            }
        }

        if (dead.Count > 0)
        {
            _db.PushSubscriptions.RemoveRange(dead);
            try { await _db.SaveChangesAsync(ct); } catch { /* prune best-effort */ }
        }
    }
}
