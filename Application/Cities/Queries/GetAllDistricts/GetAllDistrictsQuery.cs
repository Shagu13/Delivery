using Application.Cities.DTOs;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Queries.GetAllDistricts;

/// <summary>
/// Flat list of every active district (in an active city) with its parent city details and that
/// city's delivery schedule, ordered by city then district name. Used by the price calculator "To" picker.
/// </summary>
public sealed record GetAllDistrictsQuery : IRequest<IReadOnlyList<AllDistrictDto>>;

public sealed class GetAllDistrictsQueryHandler : IRequestHandler<GetAllDistrictsQuery, IReadOnlyList<AllDistrictDto>>
{
    private readonly IAppDbContext _context;
    public GetAllDistrictsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<AllDistrictDto>> Handle(GetAllDistrictsQuery request, CancellationToken ct)
    {
        return await (
            from d in _context.Districts.AsNoTracking()
            where d.DateDeleted == null && d.City.DateDeleted == null
            join s in _context.DeliverySchedules.Where(s => s.DateDeleted == null)
                on d.CityId equals s.CityId into schedules
            from s in schedules.DefaultIfEmpty()
            orderby d.City.CityName, d.DistrictName
            select new AllDistrictDto(
                d.Id,
                d.DistrictName,
                d.DistrictNameGeo,
                d.City.Id,
                d.City.CityName,
                d.City.CityNameGeo,
                d.CompanyServicePrice,
                d.IsCapitalTerritory,
                d.IsCityTerritory,
                s != null,
                s != null && s.Monday,
                s != null && s.Tuesday,
                s != null && s.Wednesday,
                s != null && s.Thursday,
                s != null && s.Friday,
                s != null && s.Saturday,
                s != null && s.Sunday)
        ).ToListAsync(ct);
    }
}
