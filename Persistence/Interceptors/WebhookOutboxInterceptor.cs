using System.Text.Json;
using Application.Common.Interfaces;
using Application.PartnerOrders;
using Application.PartnerWebhooks;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace Persistence.Interceptors;

/// <summary>
/// Detects Order status changes during a save and, after that save commits, writes
/// one <see cref="WebhookDelivery"/> outbox row per active partner webhook. The
/// background sender then delivers them. Enqueue runs after commit (in a fresh
/// scope) so a webhook is never queued for a change that rolled back.
///
/// Scoped (one instance per DbContext), so the captured list is single-threaded.
/// </summary>
public sealed class WebhookOutboxInterceptor : SaveChangesInterceptor
{
    // Safety net only — create/deactivate handlers invalidate the flag immediately.
    private static readonly TimeSpan AnyActiveCacheDuration = TimeSpan.FromMinutes(5);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ICacheService _cache;
    private readonly List<Captured> _captured = new();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public WebhookOutboxInterceptor(IServiceScopeFactory scopeFactory, ICacheService cache)
    {
        _scopeFactory = scopeFactory;
        _cache = cache;
    }

    private readonly record struct Captured(
        Guid?         CustomerId,
        Guid?         GroupOrderId,
        string        TrackingNumber,
        string?       ExternalReference,
        string        RecipientName,
        OrderStatus   NewStatus,
        OrderStatus?  PreviousStatus);

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
        EnqueueAsync(CancellationToken.None).GetAwaiter().GetResult();
        return base.SavedChanges(eventData, result);
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData, int result,
        CancellationToken cancellationToken = default)
    {
        await EnqueueAsync(cancellationToken);
        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    private void Detect(DbContext? context)
    {
        _captured.Clear();
        if (context is null) return;

        foreach (var entry in context.ChangeTracker.Entries<Order>())
        {
            if (entry.State != EntityState.Modified) continue;

            var statusProp = entry.Property(o => o.Status);
            if (!statusProp.IsModified) continue;

            var prev = (OrderStatus)statusProp.OriginalValue!;
            var cur  = (OrderStatus)statusProp.CurrentValue!;
            if (prev == cur) continue;

            var o = entry.Entity;
            _captured.Add(new Captured(
                o.CustomerId, o.GroupOrderId, o.TrackingNumber,
                o.ExternalReference, o.RecipientName, cur, prev));
        }
    }

    private async Task<bool> AnyActiveWebhookAsync(AppDbContext db, CancellationToken ct)
    {
        // A cache outage must never fail the save that already committed — fall back to the DB.
        try
        {
            var cached = await _cache.GetAsync<bool?>(WebhookCacheKeys.AnyActive, ct);
            if (cached is bool known) return known;
        }
        catch (Exception) { /* fall through to the query */ }

        var any = await db.PartnerWebhooks.AnyAsync(w => w.IsActive, ct);

        try { await _cache.SetAsync<bool?>(WebhookCacheKeys.AnyActive, any, AnyActiveCacheDuration, ct); }
        catch (Exception) { /* best-effort */ }

        return any;
    }

    private async Task EnqueueAsync(CancellationToken ct)
    {
        if (_captured.Count == 0) return;

        var events = _captured.ToList();
        _captured.Clear();

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Most deployments have no active webhook at all — skip the owner/webhook lookups
        // (two extra round trips on a fresh DbContext) on every status change in that case.
        if (!await AnyActiveWebhookAsync(db, ct))
            return;

        // Resolve owning customer for send orders (CustomerId null → via GroupOrder).
        var groupIds = events
            .Where(e => e.CustomerId is null && e.GroupOrderId is not null)
            .Select(e => e.GroupOrderId!.Value)
            .Distinct()
            .ToList();

        var groupToCustomer = groupIds.Count > 0
            ? await db.GroupOrders
                .Where(g => groupIds.Contains(g.Id) && g.CustomerId != null)
                .Select(g => new { g.Id, g.CustomerId })
                .ToDictionaryAsync(x => x.Id, x => x.CustomerId!.Value, ct)
            : new Dictionary<Guid, Guid>();

        var resolved = events
            .Select(e =>
            {
                Guid? cid = e.CustomerId
                    ?? (e.GroupOrderId is { } gid && groupToCustomer.TryGetValue(gid, out var c) ? c : null);
                return (Event: e, CustomerId: cid);
            })
            .Where(x => x.CustomerId is not null)
            .ToList();

        if (resolved.Count == 0) return;

        var customerIds = resolved.Select(x => x.CustomerId!.Value).Distinct().ToList();

        var webhooksByCustomer = (await db.PartnerWebhooks
                .Where(w => customerIds.Contains(w.CustomerId) && w.IsActive)
                .ToListAsync(ct))
            .GroupBy(w => w.CustomerId)
            .ToDictionary(g => g.Key, g => g.ToList());

        if (webhooksByCustomer.Count == 0) return;

        var now = CustomTime.Now;
        var added = false;

        foreach (var (e, cid) in resolved)
        {
            if (!webhooksByCustomer.TryGetValue(cid!.Value, out var hooks)) continue;

            var status = PartnerOrderStatusMapper.Map(e.NewStatus);
            var prev   = e.PreviousStatus is { } p ? PartnerOrderStatusMapper.Map(p) : (PartnerOrderStatus?)null;

            var payload = JsonSerializer.Serialize(new
            {
                @event            = "order.status_changed",
                occurredAt        = now,
                trackingNumber    = e.TrackingNumber,
                externalReference = e.ExternalReference,
                status            = status.ToString(),
                statusCode        = (int)status,
                previousStatus    = prev?.ToString(),
                recipientName     = e.RecipientName,
            }, JsonOptions);

            foreach (var hook in hooks)
            {
                db.WebhookDeliveries.Add(new WebhookDelivery
                {
                    WebhookId     = hook.Id,
                    CustomerId    = cid.Value,
                    EventType     = "order.status_changed",
                    PayloadJson   = payload,
                    Status        = WebhookDeliveryStatus.Pending,
                    NextAttemptAt = now,
                    CreatedAt     = now,
                });
                added = true;
            }
        }

        if (added)
            await db.SaveChangesAsync(ct);
    }
}
