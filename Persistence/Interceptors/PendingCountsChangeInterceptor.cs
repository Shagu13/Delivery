using Application.Common.Interfaces;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Persistence.Interceptors;

/// <summary>
/// After any save that inserts/updates a <see cref="GroupOrder"/> or a
/// Return/Exchange <see cref="Order"/>, pushes refreshed admin badge counts over
/// SignalR. This is the event source that replaced the old 30-second polling.
///
/// Scoped (one instance per DbContext), so the per-save flag is single-threaded.
/// </summary>
public sealed class PendingCountsChangeInterceptor : SaveChangesInterceptor
{
    private readonly IPendingCountsNotifier _notifier;
    private bool _relevantChange;

    public PendingCountsChangeInterceptor(IPendingCountsNotifier notifier)
        => _notifier = notifier;

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData, InterceptionResult<int> result)
    {
        Detect(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Detect(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        Fire();
        return base.SavedChanges(eventData, result);
    }

    public override ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData, int result,
        CancellationToken cancellationToken = default)
    {
        Fire();
        return base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    private void Detect(DbContext? context)
    {
        if (context is null) { _relevantChange = false; return; }

        _relevantChange = context.ChangeTracker.Entries().Any(e =>
        {
            if (e.State is not (EntityState.Added or EntityState.Modified))
                return false;
            if (e.Entity is GroupOrder)
                return true;
            return e.Entity is Order o
                && o.OrderType is OrderType.Return or OrderType.Exchange;
        });
    }

    private void Fire()
    {
        if (!_relevantChange) return;
        _relevantChange = false;
        _notifier.NotifyChanged();
    }
}
