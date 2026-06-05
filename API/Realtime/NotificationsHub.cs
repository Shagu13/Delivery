using Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace API.Realtime;

/// <summary>
/// Real-time push channel for admins. Currently carries the staff-nav pending
/// badge counts (group orders + return/exchange) so they update instantly instead
/// of being polled every 30 seconds.
/// </summary>
[Authorize(Roles = "Admin")]
public sealed class NotificationsHub : Hub
{
    public const string AdminsGroup = "admins";

    private readonly IPendingCountsNotifier _notifier;

    public NotificationsHub(IPendingCountsNotifier notifier) => _notifier = notifier;

    public override async Task OnConnectedAsync()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, AdminsGroup);
        await base.OnConnectedAsync();

        // Send the current counts straight away so the badges are correct on load;
        // the client otherwise only hears about subsequent changes.
        _notifier.NotifyChanged();
    }
}
