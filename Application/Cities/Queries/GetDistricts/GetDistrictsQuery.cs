using Application.Cities.DTOs;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Queries.GetDistricts;

/// <summary>
/// A city's districts ordered by name: the active ones, or — with <paramref name="Deleted"/> — the
/// soft-deleted ones an admin can reactivate.
/// For the active list, returns <c>null</c> when the city does not exist or is deleted (the controller
/// maps it to 404). The deleted list does not check the city, matching the endpoint's behaviour.
/// </summary>
public sealed record GetDistrictsQuery(Guid CityId, bool Deleted = false) : IRequest<IReadOnlyList<DistrictDto>?>;

public sealed class GetDistrictsQueryHandler : IRequestHandler<GetDistrictsQuery, IReadOnlyList<DistrictDto>?>
{
    private readonly IAppDbContext _context;
    public GetDistrictsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<DistrictDto>?> Handle(GetDistrictsQuery request, CancellationToken ct)
    {
        IQueryable<District> districts = _context.Districts.AsNoTracking();

        if (request.Deleted)
        {
            districts = districts.Where(d => d.CityId == request.CityId && d.DateDeleted != null);
        }
        else
        {
            var cityExists = await _context.Cities
                .AnyAsync(c => c.Id == request.CityId && c.DateDeleted == null, ct);
            if (!cityExists) return null;

            districts = districts.Where(d => d.CityId == request.CityId && d.DateDeleted == null);
        }

        return await districts
            .OrderBy(d => d.DistrictName)
            .Select(d => new DistrictDto(d.Id, d.DistrictName, d.DistrictNameGeo, d.CompanyServicePrice, d.IsCapitalTerritory, d.IsCityTerritory))
            .ToListAsync(ct);
    }
}
