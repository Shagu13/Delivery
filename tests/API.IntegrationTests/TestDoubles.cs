using Application.Common.Interfaces;
using Domain;

namespace API.IntegrationTests;

/// <summary>Deterministic, no-DB tracking-number generator for tests.</summary>
internal sealed class FakeTrackingNumberGenerator : ITrackingNumberGenerator
{
    private int _n;

    public Task<string> GenerateAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult($"TN-{++_n:D8}");

    public Task<IReadOnlyList<string>> GenerateManyAsync(int count, CancellationToken cancellationToken = default)
    {
        List<string> nums = new(count);
        for (int i = 0; i < count; i++) nums.Add($"TN-{++_n:D8}");
        return Task.FromResult<IReadOnlyList<string>>(nums);
    }
}

/// <summary>Swallows admin SMS notifications — nothing to send in tests.</summary>
internal sealed class NoopAdminSms : IAdminNotificationSmsService
{
    public Task SendNewGroupOrderNotificationAsync(GroupOrder groupOrder, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;
}

/// <summary>Cache that always misses — keeps the CachingBehavior pipeline step happy.</summary>
internal sealed class NoopCache : ICacheService
{
    public Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default) =>
        Task.FromResult<T?>(default);

    public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;

    public Task RemoveAsync(string key, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;
}
