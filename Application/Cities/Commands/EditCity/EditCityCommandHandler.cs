using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Commands.EditCity;

public sealed class EditCityCommandHandler : IRequestHandler<EditCityCommand>
{
    private readonly IAppDbContext _context;

    public EditCityCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(EditCityCommand request, CancellationToken cancellationToken)
    {
        var city = await _context.Cities
            .FirstOrDefaultAsync(c => c.Id == request.Id && c.DateDeleted == null, cancellationToken)
            ?? throw new NotFoundException("City", request.Id);

        var nameConflict = await _context.Cities
            .AnyAsync(c => c.CityName == request.CityName && c.Id != request.Id && c.DateDeleted == null, cancellationToken);

        if (nameConflict)
            throw new ConflictException($"A city named '{request.CityName}' already exists.");

        city.CityName    = request.CityName.Trim();
        city.CityNameGeo = string.IsNullOrWhiteSpace(request.CityNameGeo) ? null : request.CityNameGeo.Trim();

        await _context.SaveChangesAsync(cancellationToken);
    }
}
