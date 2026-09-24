using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.SearchRecipientSuggestions;

/// One distinct recipient snapshot pulled from a past order — enough to autofill a new
/// package's recipient section. Not a saved entity: there is no Recipient table, this is
/// just a distinct (name, phone, city, district, address) combination seen before.
public sealed record RecipientSuggestionDto(
    string RecipientName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress
);

/// Past recipients whose phone contains the given digits, scoped to one customer's own
/// order history (both ownership paths — GroupOrder-based Send/Exchange and standalone
/// Return). Powers the recipient-autofill dropdown on the admin "+ Add Package" and
/// customer create-order pages. Distinct per (name, phone, city, district, address) since
/// the same phone can carry different addresses across past orders; most recent first.
public sealed record SearchRecipientSuggestionsQuery(Guid CustomerId, string Phone)
    : IRequest<IReadOnlyList<RecipientSuggestionDto>>;

public sealed class SearchRecipientSuggestionsQueryHandler
    : IRequestHandler<SearchRecipientSuggestionsQuery, IReadOnlyList<RecipientSuggestionDto>>
{
    private readonly IAppDbContext _context;
    public SearchRecipientSuggestionsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<RecipientSuggestionDto>> Handle(
        SearchRecipientSuggestionsQuery request,
        CancellationToken cancellationToken)
    {
        var term = request.Phone.Trim();
        if (term.Length < 2) return Array.Empty<RecipientSuggestionDto>();

        var rows = await _context.Orders.AsNoTracking()
            .Where(o => (o.GroupOrder != null && o.GroupOrder.CustomerId == request.CustomerId)
                        || o.CustomerId == request.CustomerId)
            .Where(o => o.RecipientPhone.Contains(term))
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new
            {
                o.RecipientName, o.RecipientPhone, o.RecipientCity, o.RecipientDistrict, o.RecipientAddress,
            })
            .Take(200)
            .ToListAsync(cancellationToken);

        // Dedup in memory — GroupBy preserves the first (most recent, since already ordered)
        // row per distinct combination.
        return rows
            .GroupBy(o => (o.RecipientPhone, o.RecipientName, o.RecipientCity, o.RecipientDistrict, o.RecipientAddress))
            .Select(g => g.First())
            .Take(8)
            .Select(o => new RecipientSuggestionDto(
                o.RecipientName, o.RecipientPhone, o.RecipientCity, o.RecipientDistrict, o.RecipientAddress))
            .ToList();
    }
}
