using Application.Common.Interfaces;
using Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Persistence.Interceptors;

/// <summary>
/// After any save, pushes live "refetch" pings over SignalR: to all admins whenever the
/// order set changes (a new order is placed, a status advances, a courier is assigned),
/// and to a specific courier when an Order or GroupOrder is assigned to — or reassigned
/// away from — them.
///
/// Scoped (one instance per DbContext), so the per-save state is single-threaded.
/// Detection runs in SavingChanges (while original values are still available); the
/// broadcast fires in SavedChanges so clients only refetch after the data is committed.
/// </summary>
public sealed class RealtimeDashboardInterceptor : SaveChangesInterceptor
{
    private readonly IRealtimeNotifier _notifier;
    private bool _adminOrdersChanged;
    private readonly HashSet<Guid> _couriersToNotify = new();

    public RealtimeDashboardInterceptor(IRealtimeNotifier notifier) => _notifier = notifier;

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
        _adminOrdersChanged = false;
        _couriersToNotify.Clear();
        if (context is null) return;

        foreach (var entry in context.ChangeTracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted))
                continue;

            if (entry.Entity is GroupOrder or Order)
            {
                _adminOrdersChanged = true;
                CollectCouriers(entry);
            }
        }
    }

    // Notify both the previous and the new courier so a (re)assignment shows up for the
    // new courier and disappears for the old one.
    private void CollectCouriers(EntityEntry entry)
    {
        if (entry.Metadata.FindProperty("CourierId") is null) return;

        var member = entry.Property("CourierId");

        if (entry.State == EntityState.Added)
        {
            AddCourier(member.CurrentValue);
        }
        else if (entry.State == EntityState.Modified && member.IsModified)
        {
            AddCourier(member.OriginalValue);
            AddCourier(member.CurrentValue);
        }

        // A soft delete (DateDeleted stamped) leaves CourierId untouched, so the branch
        // above misses it — ping the still-assigned courier so the package drops off
        // their app immediately.
        if (entry.State == EntityState.Modified
            && entry.Metadata.FindProperty("DateDeleted") is not null
            && entry.Property("DateDeleted") is { IsModified: true, CurrentValue: not null })
        {
            AddCourier(member.CurrentValue);
        }
    }

    private void AddCourier(object? value)
    {
        if (value is Guid g && g != Guid.Empty)
            _couriersToNotify.Add(g);
    }

    private void Fire()
    {
        if (_adminOrdersChanged)
            _notifier.NotifyAdminsOrdersChanged();

        foreach (var courierId in _couriersToNotify)
            _notifier.NotifyCourierOrdersChanged(courierId);

        _adminOrdersChanged = false;
        _couriersToNotify.Clear();
    }
}
