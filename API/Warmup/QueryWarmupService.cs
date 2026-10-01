using Application.GroupOrders.Queries.GetAllGroupOrders;
using Application.GroupOrders.Queries.GetGroupOrderLocations;
using Application.GroupOrders.Queries.GetPickupDay;
using Domain;
using MediatR;

namespace API.Warmup;

/// <summary>
/// Runs the admin Packages page's read queries once, in the background, right after the app
/// starts listening. After a restart (every deploy and setting change) the first real request
/// otherwise pays JIT compilation and EF query compilation for these heavy queries — measured
/// at ~16 s for the first Packages load versus ~3 s warm. Doing it here moves that cost onto a
/// background task instead of the first admin who opens the page.
///
/// Read-only and best-effort: any failure is logged and ignored, and it never blocks startup.
/// </summary>
public sealed class QueryWarmupService : BackgroundService
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(90);

    private readonly IHostApplicationLifetime _lifetime;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<QueryWarmupService> _logger;

    public QueryWarmupService(
        IHostApplicationLifetime lifetime,
        IServiceScopeFactory scopeFactory,
        ILogger<QueryWarmupService> logger)
    {
        _lifetime = lifetime;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Wait until Kestrel is listening so warm-up never delays the platform's startup probe.
        TaskCompletionSource started = new(TaskCreationOptions.RunContinuationsAsynchronously);
        using CancellationTokenRegistration startedReg = _lifetime.ApplicationStarted.Register(() => started.TrySetResult());
        using CancellationTokenRegistration stoppingReg = stoppingToken.Register(() => started.TrySetCanceled());

        try
        {
            await started.Task;
        }
        catch (OperationCanceledException)
        {
            return;
        }

        using CancellationTokenSource timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        timeout.CancelAfter(Timeout);

        long startedAt = System.Diagnostics.Stopwatch.GetTimestamp();
        try
        {
            using IServiceScope scope = _scopeFactory.CreateScope();
            ISender sender = scope.ServiceProvider.GetRequiredService<ISender>();
            DateTime today = CustomTime.Today;

            // Sequential on purpose: one DbContext per scope isn't thread-safe, and the app
            // may be running on a single core.
            // The Packages page issues two list shapes — the paged list (no date bound) and the
            // single-day merge window — which EF compiles separately, so warm both.
            await sender.Send(new GetAllGroupOrdersQuery(
                SearchTerm: null, ExcludeCompleted: true, Page: 1, PageSize: 30), timeout.Token);
            await sender.Send(new GetAllGroupOrdersQuery(
                SearchTerm: null, Date: today, DateTo: today, ExcludeCompleted: true, Page: 1, PageSize: 500), timeout.Token);
            await sender.Send(new GetPickupDayQuery(today), timeout.Token);
            await sender.Send(new GetGroupOrderLocationsQuery(), timeout.Token);

            _logger.LogInformation("[WARMUP] Admin Packages queries warmed in {ElapsedMs} ms",
                (long)System.Diagnostics.Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down — nothing to report.
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[WARMUP] Query warm-up failed (ignored)");
        }
    }
}
