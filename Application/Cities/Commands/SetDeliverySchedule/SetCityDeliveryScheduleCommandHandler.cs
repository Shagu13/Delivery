using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Commands.SetDeliverySchedule;

public sealed class SetCityDeliveryScheduleCommandHandler
    : IRequestHandler<SetCityDeliveryScheduleCommand, SetCityDeliveryScheduleResult>
{
    private readonly IAppDbContext _context;

    public SetCityDeliveryScheduleCommandHandler(IAppDbContext context) => _context = context;

    public async Task<SetCityDeliveryScheduleResult> Handle(
        SetCityDeliveryScheduleCommand request, CancellationToken cancellationToken)
    {
        var cityExists = await _context.Cities
            .AnyAsync(c => c.Id == request.CityId && c.DateDeleted == null, cancellationToken);

        if (!cityExists)
            throw new NotFoundException("City", request.CityId);

        var schedule = await _context.DeliverySchedules
            .FirstOrDefaultAsync(s => s.CityId == request.CityId && s.DateDeleted == null, cancellationToken);

        if (schedule is null)
        {
            schedule = new DeliverySchedule { CityId = request.CityId };
            _context.DeliverySchedules.Add(schedule);
        }

        schedule.Monday    = request.Monday;
        schedule.Tuesday   = request.Tuesday;
        schedule.Wednesday = request.Wednesday;
        schedule.Thursday  = request.Thursday;
        schedule.Friday    = request.Friday;
        schedule.Saturday  = request.Saturday;
        schedule.Sunday    = request.Sunday;

        await _context.SaveChangesAsync(cancellationToken);

        return new SetCityDeliveryScheduleResult(
            schedule.CityId, schedule.Monday, schedule.Tuesday, schedule.Wednesday,
            schedule.Thursday, schedule.Friday, schedule.Saturday, schedule.Sunday);
    }
}
