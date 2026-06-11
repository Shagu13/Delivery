using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Commands.RestoreDistrict;

public sealed class RestoreDistrictCommandHandler : IRequestHandler<RestoreDistrictCommand>
{
    private readonly IAppDbContext _context;

    public RestoreDistrictCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(RestoreDistrictCommand request, CancellationToken cancellationToken)
    {
        var district = await _context.Districts
            .Include(d => d.City)
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.DateDeleted != null, cancellationToken)
            ?? throw new NotFoundException("District", request.Id);

        // A district cannot be active while its parent city is deleted.
        if (district.City.DateDeleted != null)
            throw new ConflictException("Restore the city before restoring its districts.");

        // Block restoring if an active district with the same name already exists in the city.
        var conflict = await _context.Districts
            .AnyAsync(d => d.Id != district.Id
                        && d.CityId == district.CityId
                        && d.DistrictName == district.DistrictName
                        && d.DateDeleted == null, cancellationToken);

        if (conflict)
            throw new ConflictException($"An active district named '{district.DistrictName}' already exists in this city.");

        district.DateDeleted = null;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
