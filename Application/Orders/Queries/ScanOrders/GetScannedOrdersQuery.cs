using Application.Common.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.ScanOrders;

/// Re-reads the scanned list fresh from the database for the courier Excel manifest, so the
/// file reflects current order data rather than what was on screen when each barcode was scanned.
public sealed record GetScannedOrdersQuery(IReadOnlyList<string> TrackingNumbers, Guid? CourierId = null)
    : IRequest<List<ScannedOrderDto>>;

public sealed class GetScannedOrdersQueryValidator : AbstractValidator<GetScannedOrdersQuery>
{
    public GetScannedOrdersQueryValidator()
    {
        RuleFor(x => x.TrackingNumbers).NotEmpty().Must(l => l.Count <= 2000);
        RuleForEach(x => x.TrackingNumbers).NotEmpty().MaximumLength(50);
    }
}

public sealed class GetScannedOrdersQueryHandler
    : IRequestHandler<GetScannedOrdersQuery, List<ScannedOrderDto>>
{
    private readonly IAppDbContext _context;
    public GetScannedOrdersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<List<ScannedOrderDto>> Handle(GetScannedOrdersQuery request, CancellationToken cancellationToken)
    {
        List<string> numbers = request.TrackingNumbers
            .Select(t => t.Trim().ToUpperInvariant())
            .Distinct()
            .ToList();

        IQueryable<Domain.Order> query = _context.Orders
            .AsNoTracking()
            .Include(o => o.Courier)
            .Include(o => o.GroupOrder)!.ThenInclude(g => g!.Customer)
            .Include(o => o.Customer)
            .Where(o => numbers.Contains(o.TrackingNumber) && o.CourierId != null);

        if (request.CourierId is Guid courierId)
            query = query.Where(o => o.CourierId == courierId);

        List<Domain.Order> orders = await query.ToListAsync(cancellationToken);

        // Orders store only the English city/district; resolve the Georgian names once from the
        // master tables (same approach as the order list) for the Georgian Excel.
        Dictionary<string, string?> cityGeo = (await _context.Cities.AsNoTracking()
                .Where(c => c.DateDeleted == null)
                .Select(c => new { c.CityName, c.CityNameGeo })
                .ToListAsync(cancellationToken))
            .GroupBy(c => c.CityName)
            .ToDictionary(g => g.Key, g => (string?)g.First().CityNameGeo);

        Dictionary<(string, string), string?> districtGeo = (await _context.Districts.AsNoTracking()
                .Where(d => d.DateDeleted == null)
                .Select(d => new { d.DistrictName, City = d.City.CityName, d.DistrictNameGeo })
                .ToListAsync(cancellationToken))
            .GroupBy(d => (d.City, d.DistrictName))
            .ToDictionary(g => g.Key, g => (string?)g.First().DistrictNameGeo);

        return orders
            .OrderBy(o => o.Courier!.FirstName).ThenBy(o => o.Courier!.LastName)
            .ThenBy(o => o.RecipientCity).ThenBy(o => o.RecipientDistrict)
            .Select(o => ScannedOrderMapper.ToDto(
                o,
                cityGeo.GetValueOrDefault(o.RecipientCity),
                districtGeo.GetValueOrDefault((o.RecipientCity, o.RecipientDistrict))))
            .ToList();
    }
}
