using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Cities.Commands.CreateCity;

public sealed class CreateCityCommandHandler : IRequestHandler<CreateCityCommand, CreateCityResult>
{
    private readonly IAppDbContext _context;

    public CreateCityCommandHandler(IAppDbContext context) => _context = context;

    public async Task<CreateCityResult> Handle(CreateCityCommand request, CancellationToken cancellationToken)
    {
        var exists = await _context.Cities
            .AnyAsync(c => c.CityName == request.CityName && c.DateDeleted == null, cancellationToken);

        if (exists)
            throw new ConflictException($"A city named '{request.CityName}' already exists.");

        var city = new City
        {
            CityName    = request.CityName.Trim(),
            CityNameGeo = string.IsNullOrWhiteSpace(request.CityNameGeo) ? null : request.CityNameGeo.Trim(),
        };

        _context.Cities.Add(city);
        await _context.SaveChangesAsync(cancellationToken);

        return new CreateCityResult(city.Id, city.CityName, city.CityNameGeo);
    }
}
