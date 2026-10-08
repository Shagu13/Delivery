using Application.Common.Interfaces;

namespace API.Notifications;

/// <summary>
/// Registered as a singleton (see <see cref="IPendingCountsNotifier"/>/<see cref="IRealtimeNotifier"/>
/// for the same shape). Each call resolves the scoped SMS/push services from a fresh DI scope
/// rather than the caller's — the caller's HTTP request (and its scope) may already have
/// completed by the time these external calls finish.
/// </summary>
public sealed class OrderAssignmentNotifier : IOrderAssignmentNotifier
{
    private static readonly TimeSpan JobTimeout = TimeSpan.FromMinutes(2);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OrderAssignmentNotifier> _logger;

    public OrderAssignmentNotifier(IServiceScopeFactory scopeFactory, ILogger<OrderAssignmentNotifier> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public void NotifyCourierAssigned(
        Guid courierId,
        string recipientPhone,
        string trackingNumber,
        string? senderBusinessName,
        string recipientCity,
        string recipientDistrict)
        => NotifyCourierAssignedBulk(courierId, new[]
        {
            new AssignedDeliveryNotice(recipientPhone, trackingNumber, senderBusinessName, recipientCity, recipientDistrict),
        });

    public void NotifyCourierAssignedBulk(Guid courierId, IReadOnlyList<AssignedDeliveryNotice> deliveries)
    {
        if (deliveries.Count == 0) return;
        _ = RunAsync(courierId, deliveries);
    }

    // One scope, one push, then the recipient SMS one order at a time. Sequential on purpose:
    // an N-order assign used to start N concurrent scopes that fought the request pool for
    // database connections and stalled the list refetches that follow an assign.
    private async Task RunAsync(Guid courierId, IReadOnlyList<AssignedDeliveryNotice> deliveries)
    {
        try
        {
            // Nothing awaits this job, so a hung gateway call would otherwise block every SMS
            // queued behind it. The deadline bounds the whole job; what's unsent is skipped.
            using var cts = new CancellationTokenSource(JobTimeout);
            CancellationToken ct = cts.Token;

            using var scope = _scopeFactory.CreateScope();
            var push = scope.ServiceProvider.GetRequiredService<IWebPushService>();
            var sms  = scope.ServiceProvider.GetRequiredService<IRecipientNotificationSmsService>();

            string title;
            string body;
            if (deliveries.Count == 1)
            {
                title = "ახალი მისატანი · New delivery";
                body  = DescribeLocation(deliveries[0].SenderBusinessName, deliveries[0].RecipientCity, deliveries[0].RecipientDistrict);
            }
            else
            {
                title = "ახალი მისატანები · New deliveries";
                body  = $"{deliveries.Count} ახალი მისატანი · {deliveries.Count} new deliveries";
            }

            try
            {
                await push.NotifyNewOrderAsync(courierId, title, body, "/", ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to push new-order notification to courier {CourierId} ({Count} deliveries)", courierId, deliveries.Count);
            }

            foreach (var d in deliveries)
            {
                if (ct.IsCancellationRequested)
                {
                    _logger.LogWarning("Assignment notification job for courier {CourierId} hit its {Timeout} deadline; remaining recipient SMS skipped", courierId, JobTimeout);
                    break;
                }

                try
                {
                    await sms.SendCourierAssignedNotificationAsync(d.RecipientPhone, d.TrackingNumber, d.SenderBusinessName ?? string.Empty, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to send recipient notification SMS for order {TrackingNumber}", d.TrackingNumber);
                }
            }
        }
        catch (Exception ex)
        {
            // Scope creation / service resolution — nothing else observes this fire-and-forget task.
            _logger.LogError(ex, "Assignment notification job failed for courier {CourierId}", courierId);
        }
    }

    public void NotifyCourierAssignedPickup(
        Guid courierId,
        string? senderBusinessName,
        string pickUpCity,
        string pickUpDistrict)
        => NotifyCourierAssignedPickupBulk(courierId, new[]
        {
            new AssignedPickupNotice(senderBusinessName, pickUpCity, pickUpDistrict),
        });

    public void NotifyCourierAssignedPickupBulk(Guid courierId, IReadOnlyList<AssignedPickupNotice> pickups)
    {
        if (pickups.Count == 0) return;
        _ = RunPickupAsync(courierId, pickups);
    }

    private async Task RunPickupAsync(Guid courierId, IReadOnlyList<AssignedPickupNotice> pickups)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var push = scope.ServiceProvider.GetRequiredService<IWebPushService>();

            string title;
            string body;
            if (pickups.Count == 1)
            {
                title = "ახალი ასაღები · New pickup";
                body  = DescribeLocation(pickups[0].SenderBusinessName, pickups[0].PickUpCity, pickups[0].PickUpDistrict);
            }
            else
            {
                title = "ახალი ასაღებები · New pickups";
                body  = $"{pickups.Count} ახალი ასაღები · {pickups.Count} new pickups";
            }

            await push.NotifyNewOrderAsync(courierId, title, body, "/", CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to push new-pickup notification to courier {CourierId} ({Count} pickups)", courierId, pickups.Count);
        }
    }

    private static string DescribeLocation(string? senderBusinessName, string city, string district)
    {
        var location = $"{city}, {district}";
        return string.IsNullOrWhiteSpace(senderBusinessName) ? location : $"{senderBusinessName} — {location}";
    }
}
