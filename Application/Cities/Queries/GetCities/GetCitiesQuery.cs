using Application.Cities.DTOs;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Queries.GetCities;

/// <summary>
/// Cities ordered by name: the active ones, or — with <paramref name="Deleted"/> — the soft-deleted
/// ones an admin can reactivate.
/// </summary>
public sealed record GetCitiesQuery(bool Deleted = false) : IRequest<IReadOnlyList<CityDto>>;

public sealed class GetCitiesQueryHandler : IRequestHandler<GetCitiesQuery, IReadOnlyList<CityDto>>
{
    private readonly IAppDbContext _context;
    public GetCitiesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CityDto>> Handle(GetCitiesQuery request, CancellationToken ct)
    {
        IQueryable<City> cities = _context.Cities.AsNoTracking();
        cities = request.Deleted
            ? cities.Where(c => c.DateDeleted != null)
            : cities.Where(c => c.DateDeleted == null);

        return await cities
            .OrderBy(c => c.CityName)
            .Select(c => new CityDto(c.Id, c.CityName, c.CityNameGeo))
            .ToListAsync(ct);
    }
}
