using System.Security.Claims;
using Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace API.Realtime;

/// <summary>
/// Real-time push channel. Admins join a shared group (staff-nav pending badge counts
/// plus order-list "refetch" pings); each courier joins their own group so they hear
/// only about orders assigned to (or reassigned away from) them.
/// </summary>
[Authorize]
public sealed class NotificationsHub : Hub
{
    public const string AdminsGroup = "admins";
    public static string CourierGroup(Guid courierId) => $"courier-{courierId}";

    private readonly IPendingCountsNotifier _notifier;

    public NotificationsHub(IPendingCountsNotifier notifier) => _notifier = notifier;

    public override async Task OnConnectedAsync()
    {
        var user = Context.User;

        // Operators share the admins' realtime channel so their Overview / Pick-Up
        // pages refetch live (they simply ignore the pending-badge pings they can't see).
        if (user?.IsInRole("Admin") == true || user?.IsInRole("Operator") == true)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, AdminsGroup);
            await base.OnConnectedAsync();

            // Send the current counts straight away so the badges are correct on load;
            // the client otherwise only hears about subsequent changes.
            _notifier.NotifyChanged();
            return;
        }

        if (user?.IsInRole("Courier") == true
            && Guid.TryParse(user.FindFirstValue("courierId"), out var courierId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, CourierGroup(courierId));
        }

        await base.OnConnectedAsync();
    }
}
