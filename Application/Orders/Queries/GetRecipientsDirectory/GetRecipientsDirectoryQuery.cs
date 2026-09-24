using Application.Common.Interfaces;
using Application.Common.Models;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.GetRecipientsDirectory;

/// <summary>
/// One unique recipient — deduped by phone across every customer's order history — for the
/// admin Recipients directory. Not a saved entity: there is no Recipient table, this is a
/// live aggregate over <see cref="Domain.Order"/>. Name/city/district/address reflect the
/// most recent order to that phone, since the same recipient can have different addresses
/// across past orders.
/// </summary>
public sealed record RecipientDirectoryDto(
    string   RecipientPhone,
    string   RecipientName,
    string   RecipientCity,
    string   RecipientDistrict,
    string   RecipientAddress,
    int      OrderCount,
    DateTime LastOrderAt
);

/// <summary>
/// Company-wide recipient directory (Admin/Operator only) — searches by name, phone, or
/// address across every customer's orders and returns one row per unique recipient phone.
/// </summary>
public sealed record GetRecipientsDirectoryQuery(
    int    Page     = 1,
    int    PageSize = 20,
    string Search   = ""
) : IRequest<PagedResult<RecipientDirectoryDto>>;

public sealed class GetRecipientsDirectoryQueryHandler
    : IRequestHandler<GetRecipientsDirectoryQuery, PagedResult<RecipientDirectoryDto>>
{
    private readonly IAppDbContext _context;
    public GetRecipientsDirectoryQueryHandler(IAppDbContext context) => _context = context;

    public async Task<PagedResult<RecipientDirectoryDto>> Handle(
        GetRecipientsDirectoryQuery request,
        CancellationToken           cancellationToken)
    {
        var filtered = _context.Orders.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLower();
            filtered = filtered.Where(o =>
                o.RecipientPhone.ToLower().Contains(term)  ||
                o.RecipientName.ToLower().Contains(term)   ||
                o.RecipientAddress.ToLower().Contains(term));
        }

        var grouped = filtered
            .GroupBy(o => o.RecipientPhone)
            .Select(g => new { Phone = g.Key, Count = g.Count(), LastOrderAt = g.Max(o => o.CreatedAt) });

        var total = await grouped.CountAsync(cancellationToken);

        var page = grouped
            .OrderByDescending(g => g.LastOrderAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize);

        var pageOfPhones = await page.ToListAsync(cancellationToken);
        var phones = pageOfPhones.Select(p => p.Phone).ToList();

        // Most recent order row per phone, for the page's phones only — one round trip via
        // GroupBy + OrderByDescending().First() (translates to a per-group CROSS APPLY),
        // not a per-row query in a loop.
        var latestPerPhone = await _context.Orders.AsNoTracking()
            .Where(o => phones.Contains(o.RecipientPhone))
            .GroupBy(o => o.RecipientPhone)
            .Select(g => g.OrderByDescending(o => o.CreatedAt).First())
            .ToListAsync(cancellationToken);

        var latestByPhone = latestPerPhone.ToDictionary(o => o.RecipientPhone);

        var items = pageOfPhones
            .Select(p =>
            {
                var latest = latestByPhone[p.Phone];
                return new RecipientDirectoryDto(
                    p.Phone,
                    latest.RecipientName,
                    latest.RecipientCity,
                    latest.RecipientDistrict,
                    latest.RecipientAddress,
                    p.Count,
                    p.LastOrderAt);
            })
            .ToList();

        return new PagedResult<RecipientDirectoryDto>(items, total, request.Page, request.PageSize);
    }
}
