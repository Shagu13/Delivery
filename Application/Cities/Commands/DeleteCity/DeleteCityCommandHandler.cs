using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Commands.DeleteCity;

public sealed class DeleteCityCommandHandler : IRequestHandler<DeleteCityCommand>
{
    private readonly IAppDbContext _context;

    public DeleteCityCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(DeleteCityCommand request, CancellationToken cancellationToken)
    {
        var city = await _context.Cities
            .FirstOrDefaultAsync(c => c.Id == request.Id && c.DateDeleted == null, cancellationToken)
            ?? throw new NotFoundException("City", request.Id);

        city.DateDeleted = DateTime.Now;

        // soft-delete all districts belonging to this city
        var districts = await _context.Districts
            .Where(d => d.CityId == request.Id && d.DateDeleted == null)
            .ToListAsync(cancellationToken);

        foreach (var d in districts)
            d.DateDeleted = DateTime.Now;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
