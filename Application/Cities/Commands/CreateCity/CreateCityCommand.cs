using MediatR;

namespace Application.Cities.Commands.CreateCity;

public sealed record CreateCityCommand(string CityName, string? CityNameGeo) : IRequest<CreateCityResult>;

public sealed record CreateCityResult(Guid Id, string CityName, string? CityNameGeo);
