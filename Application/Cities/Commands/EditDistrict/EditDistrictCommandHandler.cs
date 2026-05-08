using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Commands.EditDistrict;

public sealed class EditDistrictCommandHandler : IRequestHandler<EditDistrictCommand>
{
    private readonly IAppDbContext _context;

    public EditDistrictCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(EditDistrictCommand request, CancellationToken cancellationToken)
    {
        var district = await _context.Districts
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.DateDeleted == null, cancellationToken)
            ?? throw new NotFoundException("District", request.Id);

        var nameConflict = await _context.Districts
            .AnyAsync(d => d.CityId == district.CityId && d.DistrictName == request.DistrictName && d.Id != request.Id && d.DateDeleted == null, cancellationToken);

        if (nameConflict)
            throw new ConflictException($"District '{request.DistrictName}' already exists in this city.");

        district.DistrictName        = request.DistrictName.Trim();
        district.DistrictNameGeo     = string.IsNullOrWhiteSpace(request.DistrictNameGeo) ? null : request.DistrictNameGeo.Trim();
        district.CompanyServicePrice = request.CompanyServicePrice;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
