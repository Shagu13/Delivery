using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Commands.RestoreCity;

public sealed class RestoreCityCommandHandler : IRequestHandler<RestoreCityCommand>
{
    private readonly IAppDbContext _context;

    public RestoreCityCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(RestoreCityCommand request, CancellationToken cancellationToken)
    {
        var city = await _context.Cities
            .FirstOrDefaultAsync(c => c.Id == request.Id && c.DateDeleted != null, cancellationToken)
            ?? throw new NotFoundException("City", request.Id);

        // Block restoring if an active city with the same name already exists.
        var conflict = await _context.Cities
            .AnyAsync(c => c.Id != city.Id && c.CityName == city.CityName && c.DateDeleted == null, cancellationToken);

        if (conflict)
            throw new ConflictException($"An active city named '{city.CityName}' already exists.");

        // Restores the city only — its districts stay soft-deleted and are
        // restored individually so previously intentional deletions are preserved.
        city.DateDeleted = null;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
