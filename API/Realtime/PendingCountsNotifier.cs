using Application.Common.Interfaces;
using Domain.Enums;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace API.Realtime;

/// <summary>
/// Computes the admin pending-badge counts and broadcasts them over SignalR.
/// Registered as a singleton; recomputes on its own DI scope so it never touches
/// the caller's DbContext or connection.
/// </summary>
public sealed class PendingCountsNotifier : IPendingCountsNotifier
{
    private readonly IHubContext<NotificationsHub> _hub;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PendingCountsNotifier> _logger;

    public PendingCountsNotifier(
        IHubContext<NotificationsHub> hub,
        IServiceScopeFactory scopeFactory,
        ILogger<PendingCountsNotifier> logger)
    {
        _hub = hub;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public void NotifyChanged() => _ = BroadcastAsync();

    private async Task BroadcastAsync()
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();

            int pendingGroupOrders = await db.GroupOrders
                .AsNoTracking()
                .CountAsync(g => g.Status == OrderStatus.Pending);

            // Mirror of the client's getPendingReturnExchangeCount():
            //   Return   — open until ReturnedToSender (or admin-cancelled)
            //   Exchange — open until ExchangeCompleted/DeliveredToRecipient (or admin-cancelled)
            int returnExchange = await db.Orders
                .AsNoTracking()
                .CountAsync(o =>
                    (o.OrderType == OrderType.Return
                        && o.Status != OrderStatus.ReturnedToSender
                        && o.Status != OrderStatus.CancelledByAdmin)
                    || (o.OrderType == OrderType.Exchange
                        && o.Status != OrderStatus.ExchangeCompleted
                        && o.Status != OrderStatus.DeliveredToRecipient
                        && o.Status != OrderStatus.CancelledByAdmin));

            await _hub.Clients
                .Group(NotificationsHub.AdminsGroup)
                .SendAsync("pendingCounts", new PendingCounts(pendingGroupOrders, returnExchange));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to broadcast pending counts to admins");
        }
    }
}
