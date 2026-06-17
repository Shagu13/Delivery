using Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Persistence.Services;

public sealed class TrackingNumberGenerator : ITrackingNumberGenerator
{
    // Format: "DL" + 5 random alphanumeric characters, e.g. DL123GH.
    private const string Prefix   = "DL";
    private const int    BodyLen  = 5;
    private const string Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

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

        var accepted = new HashSet<string>(count);

        // Random codes are short and have no global uniqueness guarantee, so reject any
        // that collide within this batch or with a tracking number already in the database.
        while (accepted.Count < count)
        {
            var needed = count - accepted.Count;

            var candidates = new HashSet<string>(needed);
            while (candidates.Count < needed)
                candidates.Add(NewCandidate());
            candidates.ExceptWith(accepted);

            var candidateList = candidates.ToList();
            var taken = await _context.Orders
                .AsNoTracking()
                .Where(o => candidateList.Contains(o.TrackingNumber))
                .Select(o => o.TrackingNumber)
                .ToListAsync(cancellationToken);

            foreach (var candidate in candidateList)
                if (!taken.Contains(candidate))
                    accepted.Add(candidate);
        }

        return accepted.ToList();
    }

    private static string NewCandidate()
    {
        Span<char> body = stackalloc char[BodyLen];
        for (int i = 0; i < BodyLen; i++)
            body[i] = Alphabet[Random.Shared.Next(Alphabet.Length)];
        return string.Concat(Prefix, new string(body));
    }
}
