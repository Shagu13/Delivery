using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Data;

namespace Persistence.Services;

public sealed class TrackingNumberGenerator : ITrackingNumberGenerator
{
    private readonly AppDbContext _context;

    public TrackingNumberGenerator(AppDbContext context) => _context = context;

    public async Task<string> GenerateAsync(CancellationToken cancellationToken = default)
    {
        var results = await GenerateManyAsync(1, cancellationToken);
        return results[0];
    }

    public async Task<IReadOnlyList<string>> GenerateManyAsync(int count, CancellationToken cancellationToken = default)
    {
        if (count <= 0)
            throw new ArgumentOutOfRangeException(nameof(count), "Count must be at least 1.");

        var connection = _context.Database.GetDbConnection();

        var wasOpen = connection.State == ConnectionState.Open;
        if (!wasOpen)
            await connection.OpenAsync(cancellationToken);

        try
        {
            var results = new List<string>(count);

            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT NEXT VALUE FOR dbo.TrackingNumberSeq";

            for (int i = 0; i < count; i++)
            {
                var result = await command.ExecuteScalarAsync(cancellationToken);
                var sequence = Convert.ToInt64(result);
                var suffix = Guid.NewGuid().ToString("N")[..4].ToUpper();
                results.Add($"{sequence:D6}-{suffix}");
            }

            return results;
        }
        finally
        {
            if (!wasOpen)
                await connection.CloseAsync();
        }
    }
}