using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Queries.GetOrderLocations;

/// A distinct recipient city + district pair that actually appears in orders.
public sealed record OrderLocationDto(string City, string? CityGeo, string District, string? DistrictGeo);

/// Distinct city/district pairs used across orders — drives the Delivery page City/District
/// filters so they list only locations that have orders (not the whole master list), and the
/// full set across every page (not just the loaded one). Scoped to the tenant (co-admin) and,
/// when set, the selected Georgian day, matching the order list it filters.
public sealed record GetOrderLocationsQuery(DateTime? Date = null, Guid? TenantId = null)
    : IRequest<List<OrderLocationDto>>;

public sealed class GetOrderLocationsQueryHandler
    : IRequestHandler<GetOrderLocationsQuery, List<OrderLocationDto>>
{
    private readonly IAppDbContext _context;
    public GetOrderLocationsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<List<OrderLocationDto>> Handle(
        GetOrderLocationsQuery request,
        CancellationToken cancellationToken)
    {
        var query = _context.Orders.AsNoTracking();

        // Tenant scope (co-admin) — only this tenant's orders, via either ownership path.
        if (request.TenantId is Guid tenantId)
            query = query.Where(o =>
                (o.GroupOrder != null && o.GroupOrder.Customer != null && o.GroupOrder.Customer.TenantId == tenantId)
                || (o.Customer != null && o.Customer.TenantId == tenantId));

        // Created-day scope — CreatedAt is Georgian wall-clock, so a plain .Date comparison
        // against the selected Georgian day is correct (mirrors the order list).
        if (request.Date.HasValue)
        {
            var day = request.Date.Value.Date;
            query = query.Where(o => o.CreatedAt.Date == day);
        }

        // Skip any blank location so the filters never offer an empty option.
        query = query.Where(o =>
            o.RecipientCity != null && o.RecipientCity != "" &&
            o.RecipientDistrict != null && o.RecipientDistrict != "");

        var pairs = await query
            .Select(o => new { o.RecipientCity, o.RecipientDistrict })
            .Distinct()
            .ToListAsync(cancellationToken);

        // Orders store only the English city/district; resolve the Georgian display names
        // from the master tables (same approach as the order list).
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
            .OrderBy(p => p.RecipientCity).ThenBy(p => p.RecipientDistrict)
            .Select(p => new OrderLocationDto(
                p.RecipientCity,
                cityGeo.TryGetValue(p.RecipientCity, out var cg) ? cg : null,
                p.RecipientDistrict,
                districtGeo.TryGetValue((p.RecipientCity, p.RecipientDistrict), out var dg) ? dg : null))
            .ToList();
    }
}
