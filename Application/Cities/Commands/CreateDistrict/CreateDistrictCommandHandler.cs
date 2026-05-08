using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Commands.CreateDistrict;

public sealed class CreateDistrictCommandHandler : IRequestHandler<CreateDistrictCommand, CreateDistrictResult>
{
    private readonly IAppDbContext _context;

    public CreateDistrictCommandHandler(IAppDbContext context) => _context = context;

    public async Task<CreateDistrictResult> Handle(CreateDistrictCommand request, CancellationToken cancellationToken)
    {
        var cityExists = await _context.Cities
            .AnyAsync(c => c.Id == request.CityId && c.DateDeleted == null, cancellationToken);

        if (!cityExists)
            throw new NotFoundException("City", request.CityId);

        var exists = await _context.Districts
            .AnyAsync(d => d.CityId == request.CityId && d.DistrictName == request.DistrictName && d.DateDeleted == null, cancellationToken);

        if (exists)
            throw new ConflictException($"District '{request.DistrictName}' already exists in this city.");

        var district = new District
        {
            CityId              = request.CityId,
            DistrictName        = request.DistrictName.Trim(),
            DistrictNameGeo     = string.IsNullOrWhiteSpace(request.DistrictNameGeo) ? null : request.DistrictNameGeo.Trim(),
            CompanyServicePrice = request.CompanyServicePrice,
        };

        _context.Districts.Add(district);
        await _context.SaveChangesAsync(cancellationToken);

        return new CreateDistrictResult(district.Id, district.DistrictName, district.DistrictNameGeo, district.CompanyServicePrice);
    }
}
