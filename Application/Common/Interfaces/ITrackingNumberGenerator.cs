namespace Application.Common.Interfaces;

/// <summary>
/// Generates unique sequential tracking numbers: TN-00000001-A3F9
/// Backed by a SQL Server SEQUENCE to guarantee uniqueness under concurrent writes.
/// </summary>
public interface ITrackingNumberGenerator
{
    Task<string> GenerateAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GenerateManyAsync(int count, CancellationToken cancellationToken = default);
}