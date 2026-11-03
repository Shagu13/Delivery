using Application.Cities;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.PartnerOrders.Queries.GetPartnerIntakeContext;

/// <summary>
/// Everything <c>POST /api/partner/orders</c> must read before it can build the group order, in the
/// order the endpoint checks it — each step runs only if the previous one passed:
/// <list type="number">
///   <item>the partner's Customer (sender/pickup fallback) — <see cref="PartnerIntakeContextDto.Customer"/> null → 401;</item>
///   <item>which of <paramref name="ExternalReferences"/> this partner already submitted (either ownership
///         path) — non-empty <see cref="PartnerIntakeContextDto.DuplicateReferences"/> → 409;</item>
///   <item>the city/district name maps for normalising Georgian or English input.</item>
/// </list>
/// <paramref name="ExternalReferences"/> are the request's trimmed, distinct, non-blank references.
/// </summary>
public sealed record GetPartnerIntakeContextQuery(Guid CustomerId, IReadOnlyList<string> ExternalReferences)
    : IRequest<PartnerIntakeContextDto>;

public sealed record PartnerIntakeContextDto(
    PartnerSenderDto?          Customer,
    IReadOnlyList<string>      DuplicateReferences,
    PartnerLocationMapsDto?    Locations);

/// <summary>The partner profile fields the endpoint falls back to for sender/pickup details.</summary>
public sealed record PartnerSenderDto(
    string FirstName, string LastName, string? IdNumber, string BusinessName,
    string PhoneNumber, string City, string District, string Address);

/// <param name="CapitalDistrictByCity">
/// For each city with capital-territory districts, the alphabetically first one — bound to an order
/// that names the capital city without a district, so it can be priced. Keys ignore case.
/// </param>
public sealed record PartnerLocationMapsDto(
    Dictionary<string, string> CityGeoToEn,
    Dictionary<string, string> DistrictGeoToEn,
    Dictionary<string, string> CapitalDistrictByCity);

public sealed class GetPartnerIntakeContextQueryHandler
    : IRequestHandler<GetPartnerIntakeContextQuery, PartnerIntakeContextDto>
{
    private readonly IAppDbContext _context;
    public GetPartnerIntakeContextQueryHandler(IAppDbContext context) => _context = context;

    public async Task<PartnerIntakeContextDto> Handle(GetPartnerIntakeContextQuery request, CancellationToken ct)
    {
        Guid customerId = request.CustomerId;

        // ── Resolve the partner (Customer) for sender/pickup fallback ──────────
        var customer = await _context.Customers.AsNoTracking()
            .Where(c => c.Id == customerId)
            .Select(c => new PartnerSenderDto(
                c.FirstName, c.LastName, c.IdNumber, c.BusinessName,
                c.PhoneNumber, c.City, c.District, c.Address))
            .FirstOrDefaultAsync(ct);
        if (customer is null)
            return new PartnerIntakeContextDto(null, [], null);

        // ── De-duplicate by the partner's own order numbers ───────────────────
        var refs = request.ExternalReferences;
        if (refs.Count > 0)
        {
            var existing = await _context.Orders.AsNoTracking()
                .Where(o => o.ExternalReference != null
                    && refs.Contains(o.ExternalReference)
                    && (o.GroupOrder!.CustomerId == customerId || o.CustomerId == customerId))
                .Select(o => o.ExternalReference!)
                .ToListAsync(ct);

            if (existing.Count > 0)
                return new PartnerIntakeContextDto(customer, existing, null);
        }

        // ── City/district normalisation (accept Georgian or English names) ─────
        GeoNameMaps names = await GeoNameMaps.LoadAsync(_context, ct);

        var capitalDistrictByCity = await _context.Districts.AsNoTracking()
            .Where(d => d.DateDeleted == null && d.IsCapitalTerritory)
            .GroupBy(d => d.City.CityName)
            .Select(g => new { CityName = g.Key, DistrictName = g.Min(d => d.DistrictName) })
            .ToDictionaryAsync(x => x.CityName, x => x.DistrictName!, StringComparer.OrdinalIgnoreCase, ct);

        return new PartnerIntakeContextDto(
            customer, [],
            new PartnerLocationMapsDto(names.CityGeoToEn, names.DistrictGeoToEn, capitalDistrictByCity));
    }
}
