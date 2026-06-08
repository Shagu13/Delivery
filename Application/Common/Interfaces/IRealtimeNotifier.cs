namespace Application.Common.Interfaces;

/// <summary>
/// Pushes lightweight "your data changed — refetch" pings to dashboards over SignalR
/// so they update live without polling or a manual page refresh. Carries no payload:
/// the client re-queries through its normal API on receipt.
/// </summary>
public interface IRealtimeNotifier
{
    /// <summary>
    /// Tell every connected admin that the order set changed — a new order was placed,
    /// a status advanced, a courier was assigned, etc.
    /// </summary>
    void NotifyAdminsOrdersChanged();

    /// <summary>
    /// Tell a single courier that the orders assigned to them changed — a new pickup or
    /// delivery was assigned to them, or one was reassigned away.
    /// </summary>
    void NotifyCourierOrdersChanged(Guid courierId);
}
