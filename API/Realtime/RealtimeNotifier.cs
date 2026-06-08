using Application.Common.Interfaces;
using Microsoft.AspNetCore.SignalR;

namespace API.Realtime;

/// <summary>
/// SignalR implementation of <see cref="IRealtimeNotifier"/>. Fire-and-forget pings;
/// any failure is logged and never propagates to the caller's save.
/// </summary>
public sealed class RealtimeNotifier : IRealtimeNotifier
{
    private readonly IHubContext<NotificationsHub> _hub;
    private readonly ILogger<RealtimeNotifier> _logger;

    public RealtimeNotifier(IHubContext<NotificationsHub> hub, ILogger<RealtimeNotifier> logger)
    {
        _hub = hub;
        _logger = logger;
    }

    public void NotifyAdminsOrdersChanged() =>
        _ = SendAsync(_hub.Clients.Group(NotificationsHub.AdminsGroup), "adminOrdersChanged");

    public void NotifyCourierOrdersChanged(Guid courierId) =>
        _ = SendAsync(_hub.Clients.Group(NotificationsHub.CourierGroup(courierId)), "courierOrdersChanged");

    private async Task SendAsync(IClientProxy clients, string method)
    {
        try
        {
            await clients.SendAsync(method);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to push {Method} over SignalR", method);
        }
    }
}
