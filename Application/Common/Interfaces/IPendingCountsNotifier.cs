namespace Application.Common.Interfaces;

/// <summary>
/// The admin "pending work" badge counts shown in the staff nav:
/// group orders awaiting acceptance, and open return/exchange orders.
/// </summary>
public sealed record PendingCounts(int PendingGroupOrders, int ReturnExchange);

/// <summary>
/// Pushes <see cref="PendingCounts"/> to connected admin clients in real time
/// (SignalR), replacing the old 30-second client polling. Implemented in the API
/// layer; called from a persistence interceptor whenever relevant orders change.
/// </summary>
public interface IPendingCountsNotifier
{
    /// <summary>
    /// Fire-and-forget: recomputes the counts on a fresh scope and broadcasts them
    /// to every connected admin. Never blocks or faults the caller's save.
    /// </summary>
    void NotifyChanged();
}
