using Application.Common.Interfaces;
using Application.Orders.Queries.GetOrderLocations;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetGroupOrderLocations;

/// <summary>
/// Distinct pickup city/district pairs used across GroupOrders (sender="pickup" side) —
/// drives the Packages page's City/District filter so its option list is complete across
/// the whole DB, not just whatever happens to be on the currently loaded page. Mirrors
/// <see cref="GetOrderLocationsQuery"/>, which already serves the same purpose for
/// recipient-side locations (reused as-is for party="recipient"; standalone orders'
/// pickup location is their owning customer's own address).
/// </summary>
public sealed record GetGroupOrderLocationsQuery(DateTime? Date = null, DateTime? DateTo = null)
    : IRequest<List<OrderLocationDto>>;

public sealed class GetGroupOrderLocationsQueryHandler
    : IRequestHandler<GetGroupOrderLocationsQuery, List<OrderLocationDto>>
{
    private readonly IAppDbContext _context;
    public GetGroupOrderLocationsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<List<OrderLocationDto>> Handle(
        GetGroupOrderLocationsQuery request,
        CancellationToken cancellationToken)
    {
        var goQuery = _context.GroupOrders.AsNoTracking();
        var soQuery = _context.Orders
            .AsNoTracking()
            .Where(o => o.GroupOrderId == null && o.CustomerId != null && o.Customer != null);

        if (request.Date.HasValue)
        {
            var from = request.Date.Value.Date;
            var to   = (request.DateTo ?? request.Date).Value.Date;
            goQuery = goQuery.Where(go => go.CreatedAt.Date >= from && go.CreatedAt.Date <= to);
            soQuery = soQuery.Where(o  => o.CreatedAt.Date  >= from && o.CreatedAt.Date  <= to);
        }

        var goPairs = await goQuery
            .Where(go => go.PickUpCity != "" && go.PickUpDistrict != "")
            .Select(go => new { City = go.PickUpCity, District = go.PickUpDistrict })
            .Distinct()
            .ToListAsync(cancellationToken);

        var soPairs = await soQuery
            .Where(o => o.Customer!.City != "" && o.Customer!.District != "")
            .Select(o => new { City = o.Customer!.City, District = o.Customer!.District })
            .Distinct()
            .ToListAsync(cancellationToken);

        var pairs = goPairs.Concat(soPairs).Distinct().ToList();

        // Pickup locations store only the English city/district; resolve the Georgian display
        // names from the master tables (same approach as GetOrderLocationsQuery).
        var cityGeo = (await _context.Cities.AsNoTracking()
                .Where(c => c.DateDeleted == null)
                .Select(c => new { c.CityName, c.CityNameGeo })
                .ToListAsync(cancellationToken))
            .GroupBy(c => c.CityName)
            .ToDictionary(g => g.Key, g => g.First().CityNameGeo);

        var districtGeo = (await _context.Districts.AsNoTracking()
                .Where(d => d.DateDeleted == null)
                .Select(d => new { d.DistrictName, City = d.City.CityName, d.DistrictNameGeo })
                .ToListAsync(cancellationToken))
            .GroupBy(d => (d.City, d.DistrictName))
            .ToDictionary(g => g.Key, g => g.First().DistrictNameGeo);

        return pairs
            .OrderBy(p => p.City).ThenBy(p => p.District)
            .Select(p => new OrderLocationDto(
                p.City,
                cityGeo.TryGetValue(p.City, out var cg) ? cg : null,
                p.District,
                districtGeo.TryGetValue((p.City, p.District), out var dg) ? dg : null))
            .ToList();
    }
}
