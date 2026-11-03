using Application.Cities.DTOs;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Queries.GetCityDeliverySchedule;

/// <summary>
/// Which days of the week the city (and all its districts) receive deliveries.
/// Returns <c>null</c> when the city does not exist or is deleted (the controller maps it to 404);
/// a city with no schedule row yet gets <c>ScheduleSet = false</c> and every day false.
/// </summary>
public sealed record GetCityDeliveryScheduleQuery(Guid CityId) : IRequest<DeliveryScheduleDto?>;

public sealed class GetCityDeliveryScheduleQueryHandler : IRequestHandler<GetCityDeliveryScheduleQuery, DeliveryScheduleDto?>
{
    private readonly IAppDbContext _context;
    public GetCityDeliveryScheduleQueryHandler(IAppDbContext context) => _context = context;

    public async Task<DeliveryScheduleDto?> Handle(GetCityDeliveryScheduleQuery request, CancellationToken ct)
    {
        var cityExists = await _context.Cities.AnyAsync(c => c.Id == request.CityId && c.DateDeleted == null, ct);
        if (!cityExists) return null;

        var schedule = await _context.DeliverySchedules
            .AsNoTracking()
            .Where(s => s.CityId == request.CityId && s.DateDeleted == null)
            .Select(s => new DeliveryScheduleDto(true, s.Monday, s.Tuesday, s.Wednesday, s.Thursday, s.Friday, s.Saturday, s.Sunday))
            .FirstOrDefaultAsync(ct);

        return schedule ?? new DeliveryScheduleDto(false, false, false, false, false, false, false, false);
    }
}
