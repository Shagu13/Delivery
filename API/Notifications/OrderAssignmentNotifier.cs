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
        => _ = RunAsync(courierId, recipientPhone, trackingNumber, senderBusinessName, recipientCity, recipientDistrict);

    private async Task RunAsync(
        Guid courierId,
        string recipientPhone,
        string trackingNumber,
        string? senderBusinessName,
        string recipientCity,
        string recipientDistrict)
    {
        using var scope = _scopeFactory.CreateScope();
        var push = scope.ServiceProvider.GetRequiredService<IWebPushService>();
        var sms  = scope.ServiceProvider.GetRequiredService<IRecipientNotificationSmsService>();

        var location = $"{recipientCity}, {recipientDistrict}";
        var body = string.IsNullOrWhiteSpace(senderBusinessName) ? location : $"{senderBusinessName} — {location}";

        try
        {
            await push.NotifyNewOrderAsync(courierId, "ახალი მისატანი · New delivery", body, "/", CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to push new-order notification to courier {CourierId} (tracking {TrackingNumber})", courierId, trackingNumber);
        }

        try
        {
            await sms.SendCourierAssignedNotificationAsync(recipientPhone, trackingNumber, senderBusinessName ?? string.Empty, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send recipient notification SMS for order {TrackingNumber}", trackingNumber);
        }
    }
}
