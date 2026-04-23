namespace Application.Common.Interfaces;

/// <summary>
/// Implement on any IRequest to opt into the Redis caching pipeline behavior.
/// </summary>
public interface ICacheable
{
    string CacheKey { get; }
    TimeSpan? CacheDuration { get; }
}
