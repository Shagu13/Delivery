using Application.Common.Interfaces;
using MediatR;
using Microsoft.Extensions.Logging;

namespace Application.Common.Behaviors;

/// <summary>
/// Intercepts requests that implement <see cref="ICacheable"/>.
/// On a cache HIT the handler is skipped entirely; on a MISS the result is cached after execution.
/// Commands that mutate state should call <see cref="ICacheService.RemoveAsync"/> to invalidate.
/// </summary>
public sealed class CachingBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly ICacheService _cache;
    private readonly ILogger<CachingBehavior<TRequest, TResponse>> _logger;

    public CachingBehavior(ICacheService cache, ILogger<CachingBehavior<TRequest, TResponse>> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (request is not ICacheable cacheable)
            return await next();

        var cached = await _cache.GetAsync<TResponse>(cacheable.CacheKey, cancellationToken);
        if (cached is not null)
        {
            _logger.LogDebug("Cache HIT: {Key}", cacheable.CacheKey);
            return cached;
        }

        var response = await next();
        await _cache.SetAsync(cacheable.CacheKey, response, cacheable.CacheDuration, cancellationToken);
        _logger.LogDebug("Cache SET: {Key} (TTL: {Ttl})", cacheable.CacheKey, cacheable.CacheDuration);

        return response;
    }
}
