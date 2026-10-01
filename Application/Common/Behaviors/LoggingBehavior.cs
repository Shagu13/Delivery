using System.Diagnostics;
using MediatR;
using Microsoft.Extensions.Logging;

namespace Application.Common.Behaviors;

/// <summary>
/// Outermost pipeline behavior — logs every request and its outcome.
/// Placed first so it wraps Validation and Caching behaviors.
/// </summary>
public sealed class LoggingBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    // Anything slower than this is also logged at Warning so it stands out when diagnosing latency.
    private static readonly TimeSpan SlowRequestThreshold = TimeSpan.FromMilliseconds(1000);

    private readonly ILogger<LoggingBehavior<TRequest, TResponse>> _logger;

    public LoggingBehavior(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
        => _logger = logger;

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var name = typeof(TRequest).Name;
        _logger.LogInformation("[START] {Request}", name);
        long startedAt = Stopwatch.GetTimestamp();

        try
        {
            var response = await next();
            TimeSpan elapsed = Stopwatch.GetElapsedTime(startedAt);
            if (elapsed >= SlowRequestThreshold)
                _logger.LogWarning("[SLOW] {Request} took {ElapsedMs} ms", name, (long)elapsed.TotalMilliseconds);
            _logger.LogInformation("[END] {Request} in {ElapsedMs} ms", name, (long)elapsed.TotalMilliseconds);
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[FAIL] {Request} after {ElapsedMs} ms", name, (long)Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds);
            throw;
        }
    }
}
